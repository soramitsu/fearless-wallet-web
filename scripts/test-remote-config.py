#!/usr/bin/env python3
"""Exercise remote data boundaries using isolated configuration documents."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("config_check", Path(__file__).with_name("verify-remote-config.py"))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class ConfigTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.config = self.root / "remote-config"
        self.config.mkdir()

    def document(self, value):
        (self.config / "data.json").write_text(json.dumps(value))

    def test_encoded_asset_path_resolves(self):
        (self.config / "asset name.svg").write_text("<svg/>")
        self.document({"nested": [{"icon": check.BASE + "asset%20name.svg"}]})
        self.assertEqual(check.validate(self.root)["ownedReferences"], 1)

    def test_missing_nested_asset_fails(self):
        self.document({"nested": [{"icon": check.BASE + "absent.svg"}]})
        with self.assertRaisesRegex(ValueError, "missing owned asset"):
            check.validate(self.root)

    def test_external_shared_host_fails(self):
        self.document({"url": "https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/a.json"})
        with self.assertRaisesRegex(ValueError, "retired config URL"):
            check.validate(self.root)

    def test_escape_from_owned_directory_fails(self):
        (self.root / "outside.svg").write_text("<svg/>")
        self.document({"url": check.BASE + "../outside.svg"})
        with self.assertRaisesRegex(ValueError, "missing owned asset"):
            check.validate(self.root)

    def test_wrong_asset_case_fails_on_every_filesystem(self):
        (self.config / "Token.svg").write_text("<svg/>")
        self.document({"url": check.BASE + "token.svg"})
        with self.assertRaisesRegex(ValueError, "missing owned asset"):
            check.validate(self.root)

    def test_invalid_json_fails(self):
        (self.config / "data.json").write_text('{"invalid":')
        with self.assertRaises(ValueError):
            check.validate(self.root)


POLKADOT = "91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"
POLKADOT_ASSET_HUB = "68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f"
KUSAMA_ASSET_HUB = "48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a"
KARURA = "baf5aabe40646d11f0ee8abbdc64f4a4b7674925cba08e4a05ff9ebed6e2126b"


def network(name, chain_id, urls, ecosystem="substrate", destinations=None):
    row = {"name": name, "chainId": chain_id, "ecosystem": ecosystem, "nodes": [{"name": name, "url": url} for url in urls]}
    if destinations is not None:
        row["xcm"] = {"xcmVersion": "v3", "availableAssets": [], "availableDestinations": [{"chainId": chain, "assets": []} for chain in destinations]}
    return row


class ContentTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.config = self.root / "remote-config"
        self.config.mkdir()

    def chains(self, rows, tree="production"):
        path = self.config / tree / "chains" / "v13" / "chains.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(rows))

    def web_config(self, value, tree="production"):
        path = self.config / tree / "appConfigs" / "web_config.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def test_production_chain_list_with_tls_nodes_and_bundled_routes_passes(self):
        self.chains([
            network("Polkadot", POLKADOT, ["wss://rpc.polkadot.io"], destinations=[POLKADOT_ASSET_HUB]),
            network("Polkadot AssetHub", POLKADOT_ASSET_HUB, ["wss://polkadot-asset-hub-rpc.polkadot.io"]),
            network("Ethereum", "1", ["https://eth.example", "wss://eth.example"], ecosystem="ethereum"),
        ])
        self.assertEqual(check.validate(self.root)["chainLists"], 1)

    def test_plain_substrate_node_fails(self):
        self.chains([network("Polkadot", POLKADOT, ["ws://rpc.polkadot.io"])])
        with self.assertRaisesRegex(ValueError, "must use wss://"):
            check.validate(self.root)

    def test_https_substrate_node_fails(self):
        self.chains([network("Moonbeam", "moonbeam", ["https://rpc.example"], ecosystem="ethereumBased")])
        with self.assertRaisesRegex(ValueError, "must use wss://"):
            check.validate(self.root)

    def test_plain_http_evm_node_fails(self):
        self.chains([network("Ethereum", "1", ["http://eth.example"], ecosystem="ethereum")])
        with self.assertRaisesRegex(ValueError, "must use wss:// or https://"):
            check.validate(self.root)

    def test_node_credentials_fail(self):
        self.chains([network("Polkadot", POLKADOT, ["wss://user:secret@rpc.polkadot.io"])])
        with self.assertRaisesRegex(ValueError, "credentials"):
            check.validate(self.root)

    def test_duplicate_chain_id_fails(self):
        self.chains([network("Polkadot", POLKADOT, ["wss://a.example"]), network("Copy", POLKADOT, ["wss://b.example"])])
        with self.assertRaisesRegex(ValueError, "duplicate chainId"):
            check.validate(self.root)

    def test_xcm_destination_without_bundled_route_fails(self):
        self.chains([network("Polkadot", POLKADOT, ["wss://rpc.polkadot.io"], destinations=[POLKADOT_ASSET_HUB, KARURA])])
        with self.assertRaisesRegex(ValueError, "xcm destination " + KARURA + " is not a bundled route"):
            check.validate(self.root)

    def test_xcm_block_on_chain_without_bundled_route_fails(self):
        self.chains([network("Kusama AssetHub", KUSAMA_ASSET_HUB, ["wss://a.example"], destinations=[])])
        with self.assertRaisesRegex(ValueError, "xcm block on a chain without a bundled route"):
            check.validate(self.root)

    def test_development_chain_list_may_use_local_nodes_and_test_routes(self):
        self.chains([network("Local", "local", ["ws://127.0.0.1:9944"], destinations=[KARURA])], tree="development")
        self.assertEqual(check.validate(self.root)["chainLists"], 0)

    def test_action_veto_passes(self):
        self.web_config({"fiat": {"ramp": True}, "actions": {"polkaswap": False, "crossChainXcm": False}})
        self.assertEqual(check.validate(self.root)["actionConfigs"], 1)

    def test_action_true_lifting_a_veto_passes(self):
        self.web_config({"actions": {"polkaswap": True, "crossChainXcm": True}})
        self.assertEqual(check.validate(self.root)["actionConfigs"], 1)

    def test_non_boolean_action_fails_in_every_container_and_tree(self):
        for tree in ("production", "development"):
            for container in check.ACTION_CONTAINERS:
                for flag in ("false", 0, None, {"enabled": False}):
                    self.web_config({container: {"crossChainXcm": flag}}, tree=tree)
                    with self.assertRaisesRegex(ValueError, container + ".crossChainXcm must be true or false"):
                        check.validate(self.root)
                self.web_config({}, tree=tree)

    def test_non_object_action_container_fails(self):
        self.web_config({"actions": ["crossChainXcm"]})
        with self.assertRaisesRegex(ValueError, "actions must be an object"):
            check.validate(self.root)


class RepositoryConfigTests(unittest.TestCase):
    def test_repository_remote_config_passes(self):
        counts = check.validate(Path(__file__).resolve().parents[1])
        self.assertGreaterEqual(counts["chainLists"], 1)
        self.assertGreaterEqual(counts["actionConfigs"], 2)


if __name__ == "__main__":
    unittest.main()
