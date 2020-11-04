import { IDocumentStore } from "../../../src/Documents/IDocumentStore";
import { disposeTestDocumentStore, testContext } from "../../Utils/TestUtil";
import { assertThat } from "../../Utils/AssertExtensions";
import { QueryData } from "../../../src/Documents/Queries/QueryData";

describe("RavenDB_14811", function () {

    let store: IDocumentStore;

    beforeEach(async function () {
        store = await testContext.getDocumentStore();
    });

    afterEach(async () =>
        await disposeTestDocumentStore(store));

    it("can_Project_Id_Field_In_Class", async () => {
        const user = Object.assign(new User(), {
            name: "Grisha",
            age: 34
        });

        {
            const session = store.openSession();
            await session.store(user);
            await session.saveChanges();
        }

        {
            const session = store.openSession();
            const result = await session.query<User>(User)
                .selectFields<UserProjectionIntId>(["name"], UserProjectionIntId)
                .firstOrNull();

            assertThat(result)
                .isNotNull();
            assertThat(result.Id)
                .isEqualTo(undefined);
            assertThat(result.name)
                .isEqualTo(user.name);
        }

        {
            const session = store.openSession();
            const result = await session.query(User)
                .selectFields<UserProjectionIntId>(new QueryData(["Id"], ["name"]), UserProjectionIntId)
                .firstOrNull();

            assertThat(result)
                .isNotNull();
            assertThat(result.Id)
                .isEqualTo(undefined);
            assertThat(result.name)
                .isEqualTo(user.Id);
        }
    });

    it("can_project_id_field", async () => {
        const user = Object.assign(new User(), {
            name: "Grisha",
            age: 34
        });

        {
            const session = store.openSession();
            await session.store(user);
            await session.saveChanges();
        }

        {
            const session = store.openSession();
            const result = await session.query<User>(User)
                .selectFields<UserProjectionIntId>("name", UserProjectionIntId)
                .firstOrNull();

            assertThat(result)
                .isNotNull();
            assertThat(result.name)
                .isEqualTo(user.name);
        }

        {
            const session = store.openSession();
            const result = await session.query(User)
                .selectFields<UserProjectionIntId>(new QueryData(["age", "name"], ["Id", "name"]), UserProjectionIntId)
                .firstOrNull();

            assertThat(result)
                .isNotNull();
            assertThat(result.Id)
                .isEqualTo(user.age);
            assertThat(result.name)
                .isEqualTo(user.name);
        }

        {
            const session = store.openSession();
            const result = await session.query(User)
                .selectFields<UserProjectionStringId>(["Id", "name"], UserProjectionStringId)
                .firstOrNull();

            assertThat(result)
                .isNotNull();
            assertThat(result.Id)
                .isEqualTo(user.Id);
            assertThat(result.name)
                .isEqualTo(user.name);
        }

        {
            const session = store.openSession();
            const result = await session.query(User)
                .selectFields<UserProjectionStringId>(new QueryData(["name", "name"], ["Id", "name"]), UserProjectionStringId)
                .firstOrNull();

            assertThat(result)
                .isNotNull();
            assertThat(result.Id)
                .isEqualTo(user.name);
            assertThat(result.name)
                .isEqualTo(user.name);
        }
    });
});

class User {
    public Id: string;
    public name: string;
    public age: number;
}

class UserProjectionIntId {
    public Id: number;
    public name: string;
}

class UserProjectionStringId {
    public Id: string;
    public name: string;
}
