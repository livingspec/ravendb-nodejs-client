import * as assert from "assert";
import { testContext, disposeTestDocumentStore } from "../Utils/TestUtil";

import {
    IDocumentStore,
    GetClusterTopologyCommand
} from "../../src";

describe("GetClusterTopologyCommand", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("can get topology", async () => {
        const command = new GetClusterTopologyCommand();
        await store.getRequestExecutor().execute(command);
        const result = command.result;

        assert.ok(result);
        assert.ok(result.Leader);
        assert.ok(result.NodeTag);
        assert.ok(result.Status instanceof Map);

        const topology = result.Topology;
        assert.ok(topology);
        assert.strictEqual(topology.constructor.name, "ClusterTopology");
        assert.ok(topology.TopologyId);
        assert.strictEqual(Object.keys(topology.Members).length, 1);
        assert.strictEqual(Object.keys(topology.Watchers).length, 0);
        assert.strictEqual(Object.keys(topology.Promotables).length, 0);
        assert.strictEqual(Object.keys(topology.getAllNodes()).length, 1);
    });
});
