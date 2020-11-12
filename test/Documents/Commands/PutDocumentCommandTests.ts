import * as assert from "assert";
import { testContext, disposeTestDocumentStore } from "../../Utils/TestUtil";

import {
    IDocumentStore,
    PutDocumentCommand,
} from "../../../src";

describe("PutDocumentCommand", function () {

    let store: IDocumentStore;

    class User {
        public name: string;
        public age: number;
    }

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("can put document using command", async () => {
        const user = new User();
        user.name = "Marcin";
        user.age = 30;

        const putDocCmd = new PutDocumentCommand("users/1", null, user);
        await store.getRequestExecutor().execute(putDocCmd);
        const result = putDocCmd.result;

        assert.strictEqual(result.Id, "users/1");
        assert.ok(result.ChangeVector);

        const session = store.openSession();
        const loadedUser = await session.load<User>("users/1", {
            documentType: User
        });
        assert.ok(loadedUser);
        assert.strictEqual(loadedUser.name, user.name);
        assert.strictEqual(loadedUser.age, user.age);
        assert.strictEqual(loadedUser.constructor, User);
    });
});
