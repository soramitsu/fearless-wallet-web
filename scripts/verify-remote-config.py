#!/usr/bin/env python3
"""Validate browser-owned configuration and ensure nested asset URLs are self-contained.

Installed builds fetch these files from master without a release, so beyond the JSON syntax and the owned asset
URLs the content is checked against what the bundle allows:

- production chain lists: each chainId appears once, Substrate RPC nodes (substrate and ethereumBased) use wss://,
  other nodes TLS (wss:// or https://), no node URL carries credentials, and xcm blocks list only the pairs of the
  bundled routes. Development lists feed development and test builds, which may need other nodes, and are not
  checked for content;
- every web_config.json: remote capabilities are veto-only, so an action key may only be false.
"""
import json
from pathlib import Path
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
            if flag is not False:
                failures.append(source + ": " + container + "." + key + " may only be false (remote capabilities are veto-only)")


def validate(root):
    root = Path(root).resolve()
    config = root / "remote-config"
    inventory = {path.relative_to(config).as_posix() for path in config.rglob("*") if path.is_file()}
    failures = []
    counts = {"documents": 0, "ownedReferences": 0, "chainLists": 0, "actionConfigs": 0}

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
