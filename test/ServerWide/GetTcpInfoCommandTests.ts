import * as assert from "assert";
import { testContext, disposeTestDocumentStore } from "../Utils/TestUtil";

import {
    IDocumentStore,
    GetTcpInfoCommand
} from "../../src";

describe("GetTcpInfoCommand", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("can get TCP info", async () => {
        const command = new GetTcpInfoCommand("test");
        await store.getRequestExecutor().execute(command);
        const result = command.result;

        assert.ok(result);
        assert.ok(result.hasOwnProperty("Certificate"));
        assert.ok(!result.Certificate);
        assert.ok(result.Url);
    });

});
