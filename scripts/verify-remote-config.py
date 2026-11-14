#!/usr/bin/env python3
"""Validate browser-owned configuration and ensure nested asset URLs are self-contained.

Installed builds fetch these files from master without a release, so beyond the JSON syntax and the owned asset
URLs the content is checked against what the bundle allows:

- production chain lists: each chainId appears once, Substrate RPC nodes (substrate and ethereumBased) use wss://,
  other nodes TLS (wss:// or https://), no node URL carries credentials, and xcm blocks list only the pairs of the
  bundled routes. Development lists feed development and test builds, which may need other nodes, and are not
  checked for content;
- every web_config.json: remote capabilities are veto-only, so an action key must be a boolean: false vetoes and
  true lifts a remembered veto (docs/send-kill-switch.md); neither can enable an action the build compiles off;
- the ERC-20 token lists (production/tokens/evm/v1, docs/evm-token-discovery.md): each list belongs to a production EVM
  network of the production chain list and says so, holds unique 20-byte addresses in address order, printable symbols
  and names, decimals from 0 to 36 and no asset of the registry, and index.json names every list with its token count
  and SHA-256 and only MIT-licensed sources.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

REPOSITORY = "fearless-wallet-web"
BASE = "https://raw.githubusercontent.com/soramitsu/" + REPOSITORY + "/master/remote-config/"
RETIRED = ("/soramitsu/shared-features-utils/", "/soramitsu/fearless-utils/")

# (origin chainId, destination chainId) of each route bundled in src/cross-chain/reviewedRoutes.ts. A remote xcm
# block can switch such a route off but never add one, so any other pair is inert data a reviewer would have to rule
# out. tests/unit/remote-config-validator-routes.spec.ts keeps this list equal to the bundle.
BUNDLED_ROUTE_PAIRS = frozenset({
    # Polkadot -> Polkadot Asset Hub
    ("91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3",
     "68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f"),
    # Kusama -> Kusama Asset Hub
    ("b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe",
     "48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a"),
    # Liberland -> SORA Mainnet
    ("6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6",
     "7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5"),
})
SUBSTRATE_RPC_ECOSYSTEMS = ("substrate", "ethereumBased")
# The containers readRemoteActions in src/extension/background/extension-base/src/services/action-capability-service
# reads action keys from.
ACTION_CONTAINERS = ("actions", "actionCapabilities", "feature_toggle")


def node_url_failure(ecosystem, url):
    if not isinstance(url, str):
        return "node URL is not a string"
    parts = urlsplit(url)
    if parts.username is not None or parts.password is not None:
        return "node URL carries credentials"
    allowed = ("wss",) if ecosystem in SUBSTRATE_RPC_ECOSYSTEMS else ("wss", "https")
    if parts.scheme not in allowed or not parts.hostname:
        return "node URL " + url + " must use " + " or ".join(scheme + "://" for scheme in allowed)
    return None


def check_chain_list(value, source, failures):
    if not isinstance(value, list):
        failures.append(source + ": a chain list must be a JSON array")
        return
    seen = set()
    for index, network in enumerate(value):
        if not isinstance(network, dict):
            failures.append(source + ": row " + str(index) + " is not an object")
            continue
        chain_id = network.get("chainId")
        label = source + ": " + str(network.get("name", "row " + str(index)))
        if chain_id in seen:
            failures.append(label + ": duplicate chainId " + str(chain_id))
        seen.add(chain_id)
        for node in network.get("nodes") or []:
            failure = node_url_failure(network.get("ecosystem"), node.get("url") if isinstance(node, dict) else None)
            if failure:
                failures.append(label + ": " + failure)
        xcm = network.get("xcm")
        if xcm is None:
            continue
        destinations = xcm.get("availableDestinations") if isinstance(xcm, dict) else None
        if not isinstance(destinations, list):
            failures.append(label + ": xcm.availableDestinations must be a list")
            continue
        if not any(origin == chain_id for origin, _ in BUNDLED_ROUTE_PAIRS):
            failures.append(label + ": xcm block on a chain without a bundled route")
        for destination in destinations:
            target = destination.get("chainId") if isinstance(destination, dict) else None
            if (chain_id, target) not in BUNDLED_ROUTE_PAIRS:
                failures.append(label + ": xcm destination " + str(target) + " is not a bundled route")


TOKEN_LIST_DIR = ("production", "tokens", "evm", "v1")
TOKEN_LIST_FORMAT = "fearless-evm-token-list"
TOKEN_INDEX_FORMAT = "fearless-evm-token-lists"
MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"
MAX_LISTED_TOKENS = 5000
MAX_SYMBOL_LENGTH = 24
MAX_NAME_LENGTH = 64
MAX_DECIMALS = 36
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
# Control, zero-width and bidirectional formatting characters, which the wallet strips (tokenList.ts sanitizeTokenText).
INVISIBLE = re.compile("[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]")


def production_evm_networks(config):
    """The production chain list's EVM networks that are not test networks, by chain id."""
    path = config / "production" / "chains" / "v13" / "chains.json"
    try:
        rows = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    networks = {}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict) or row.get("ecosystem") != "ethereum" or row.get("disabled"):
            continue
        if any(str(option).lower() == "testnet" for option in row.get("options") or []):
            continue
        assets = {str(asset.get("id", "")).lower() for asset in row.get("assets") or [] if isinstance(asset, dict)}
        networks[str(row.get("chainId"))] = {"name": row.get("name"), "assets": assets}
    return networks


def printable(text, limit):
    return isinstance(text, str) and 0 < len(text) <= limit and text == text.strip() and not INVISIBLE.search(text)


def check_token_list(value, chain_id, source, networks, failures):
    network = networks.get(chain_id)
    if network is None:
        failures.append(source + ": chain " + chain_id + " is not a production EVM network of the chain list")
        return None
    if not isinstance(value, dict) or value.get("format") != TOKEN_LIST_FORMAT or value.get("version") != 1:
        failures.append(source + ": not a " + TOKEN_LIST_FORMAT + " version 1 document")
        return None
    if value.get("chainId") != chain_id:
        failures.append(source + ": names chain " + str(value.get("chainId")) + " instead of " + chain_id)
    if value.get("network") != network["name"]:
        failures.append(source + ": names network " + str(value.get("network")) + " instead of " + str(network["name"]))
    tokens = value.get("tokens")
    if not isinstance(tokens, list) or len(tokens) > MAX_LISTED_TOKENS:
        failures.append(source + ": tokens must be a list of at most " + str(MAX_LISTED_TOKENS))
        return None
    seen = []
    for index, token in enumerate(tokens):
        label = source + ": token " + str(index)
        if not isinstance(token, list) or len(token) != 4:
            failures.append(label + " is not [address, symbol, name, decimals]")
            continue
        address, symbol, name, decimals = token
        if not isinstance(address, str) or not ADDRESS.match(address):
            failures.append(label + " has no 20-byte hex address")
            continue
        if address.lower() in network["assets"]:
            failures.append(label + " " + address + " is a registry asset of " + str(network["name"]))
        if not printable(symbol, MAX_SYMBOL_LENGTH) or not printable(name, MAX_NAME_LENGTH):
            failures.append(label + " " + address + " needs a printable symbol of 1-24 and name of 1-64 characters")
        if not isinstance(decimals, int) or isinstance(decimals, bool) or not 0 <= decimals <= MAX_DECIMALS:
            failures.append(label + " " + address + " has decimals outside 0-" + str(MAX_DECIMALS))
        seen.append(address.lower())
    if len(set(seen)) != len(seen):
        failures.append(source + ": an address is listed twice")
    if seen != sorted(seen):
        failures.append(source + ": tokens are not in address order")
    return len(tokens)


def check_token_lists(config, failures):
    folder = config.joinpath(*TOKEN_LIST_DIR)
    if not folder.is_dir():
        return 0
    networks = production_evm_networks(config)
    source_root = "remote-config/" + "/".join(TOKEN_LIST_DIR) + "/"
    lists = {}
    for file in sorted(folder.iterdir()):
        if file.name == "index.json":
            continue
        source = source_root + file.name
        if not re.fullmatch(r"\d+\.json", file.name):
            failures.append(source + ": only <chainId>.json lists and index.json belong here")
            continue
        try:
            text = file.read_text()
            count = check_token_list(json.loads(text), file.stem, source, networks, failures)
        except (OSError, ValueError):
            continue
        if count is not None:
            lists[file.stem] = {"tokens": count, "sha256": hashlib.sha256(text.encode()).hexdigest()}
    index_source = source_root + "index.json"
    try:
        index = json.loads((folder / "index.json").read_text())
    except (OSError, ValueError):
        failures.append(index_source + ": missing or not JSON")
        return len(lists)
    if not isinstance(index, dict) or index.get("format") != TOKEN_INDEX_FORMAT or index.get("version") != 1:
        failures.append(index_source + ": not a " + TOKEN_INDEX_FORMAT + " version 1 document")
        return len(lists)
    if index.get("multicall3") != MULTICALL3:
        failures.append(index_source + ": multicall3 must be " + MULTICALL3)
    named = index.get("lists") if isinstance(index.get("lists"), dict) else {}
    for chain_id in sorted(set(named) | set(lists)):
        entry, actual = named.get(chain_id), lists.get(chain_id)
        if actual is None or not isinstance(entry, dict):
            failures.append(index_source + ": chain " + chain_id + " must have both a list file and an index entry")
            continue
        if entry.get("tokens") != actual["tokens"] or entry.get("sha256") != actual["sha256"]:
            failures.append(index_source + ": chain " + chain_id + " token count or sha256 differs from its list")
        if entry.get("network") != (networks.get(chain_id) or {}).get("name"):
            failures.append(index_source + ": chain " + chain_id + " names another network")
    sources = index.get("sources")
    if not isinstance(sources, list) or not sources:
        failures.append(index_source + ": sources must name every list it was built from")
    else:
        for item in sources:
            if not isinstance(item, dict) or item.get("license") != "MIT":
                failures.append(index_source + ": only MIT-licensed sources are used, not " + json.dumps(item)[:120])
    return len(lists)


def check_action_config(value, source, failures):
    if not isinstance(value, dict):
        failures.append(source + ": web_config must be a JSON object")
        return
    for container in ACTION_CONTAINERS:
        if container not in value:
            continue
        actions = value[container]
        if not isinstance(actions, dict):
            failures.append(source + ": " + container + " must be an object")
            continue
        for key, flag in actions.items():
            if not isinstance(flag, bool):
                failures.append(source + ": " + container + "." + key + " must be true or false (remote capabilities are veto-only)")


def validate(root):
    root = Path(root).resolve()
    config = root / "remote-config"
    inventory = {path.relative_to(config).as_posix() for path in config.rglob("*") if path.is_file()}
    failures = []
    counts = {"documents": 0, "ownedReferences": 0, "chainLists": 0, "actionConfigs": 0, "tokenLists": 0}

    def visit(value, source):
        if isinstance(value, dict):
            for child in value.values():
                visit(child, source)
        elif isinstance(value, list):
            for child in value:
                visit(child, source)
        elif isinstance(value, str):
            if any(fragment in value for fragment in RETIRED):
                failures.append(str(source) + ": retired config URL")
            if value.startswith(BASE):
                counts["ownedReferences"] += 1
                relative = unquote(urlsplit(value[len(BASE):]).path)
                target = (config / relative).resolve()
                if relative not in inventory or config.resolve() not in target.parents or not target.is_file():
                    failures.append(str(source) + ": missing owned asset " + relative)

    for file in sorted(config.rglob("*")):
        if not file.is_file() or (file.suffix != ".json" and file.name != "feature_toggle"):
            continue
        counts["documents"] += 1
        try:
            document = json.loads(file.read_text())
        except (ValueError, UnicodeError) as error:
            failures.append(str(file.relative_to(root)) + ": " + str(error))
            continue
        visit(document, file.relative_to(root))
        parts = file.relative_to(config).parts
        if file.suffix == ".json" and parts[0] == "production" and "chains" in parts[:-1]:
            counts["chainLists"] += 1
            check_chain_list(document, str(file.relative_to(root)), failures)
        if file.name == "web_config.json":
            counts["actionConfigs"] += 1
            check_action_config(document, str(file.relative_to(root)), failures)
    counts["tokenLists"] = check_token_lists(config, failures)
    if counts["documents"] == 0:
        failures.append("No owned configuration documents found")
    if failures:
        raise ValueError("\n".join(failures))
    return counts


if __name__ == "__main__":
    try:
        print(json.dumps(validate(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]), sort_keys=True))
    except (ValueError, OSError) as error:
        sys.exit(str(error))
