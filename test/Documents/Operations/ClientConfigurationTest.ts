import * as assert from "assert";
import {
    testContext,
    disposeTestDocumentStore
} from "../../Utils/TestUtil";

import {
    ClientConfiguration,
    GetClientConfigurationOperation,
    IDocumentStore, IRavenResponse, PutClientConfigurationOperation,
    PutServerWideClientConfigurationOperation,
    GetServerWideClientConfigurationOperation
} from "../../../src";
import { assertThat } from "../../Utils/AssertExtensions";

describe("Client configuration", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("canSaveAndReadServerWideClientConfiguration", async () => {
        const configurationToSave: ClientConfiguration = {
            MaxNumberOfRequestsPerSession: 80,
            ReadBalanceBehavior: "FastestNode",
            Disabled: true
        };

        const saveOperation = new PutServerWideClientConfigurationOperation(configurationToSave);

        await store.maintenance.server.send(saveOperation);

        const operation = new GetServerWideClientConfigurationOperation();
        const newConfiguration = await store.maintenance.server.send(operation);

        assertThat(newConfiguration)
            .isNotNull();
        assertThat(newConfiguration.Disabled)
            .isTrue();
        assertThat(newConfiguration.MaxNumberOfRequestsPerSession)
            .isEqualTo(80);
        assertThat(newConfiguration.ReadBalanceBehavior)
            .isEqualTo("FastestNode");
    });

    it("can handle no configuration", async () => {
        const operation = new GetClientConfigurationOperation();
        const result: IRavenResponse = await store.maintenance.send(operation);
        assert.ok(result.Etag);
    });

    it("can save and read client configuration", async () => {
        const configurationToSave: ClientConfiguration = {
            Etag: 123,
            MaxNumberOfRequestsPerSession: 80,
            ReadBalanceBehavior: "FastestNode",
            Disabled: true
        };

        const saveOperation = new PutClientConfigurationOperation(configurationToSave);
        await store.maintenance.send(saveOperation);

        const operation = new GetClientConfigurationOperation();
        const result = await store.maintenance.send(operation);
        const configuration = result.Configuration;
        assert.ok(configuration.Etag);
        assert.ok(configuration.Disabled);
        assert.strictEqual(configuration.MaxNumberOfRequestsPerSession, 80);
        assert.strictEqual(configuration.ReadBalanceBehavior, "FastestNode");
    });
});
