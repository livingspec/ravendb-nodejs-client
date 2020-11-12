import * as BluebirdPromise from "bluebird";
import { ChildProcess, spawn } from "child_process";
import * as os from "os";

import { CONSTANTS } from "../../src/Constants";
import { DocumentStore } from "../../src/Documents/DocumentStore";
import { IDocumentStore } from "../../src/Documents/IDocumentStore";
import { DatabaseStatistics } from "../../src/Documents/Operations/DatabaseStatistics";
import { GetStatisticsOperation } from "../../src/Documents/Operations/GetStatisticsOperation";
import { throwError } from "../../src/Exceptions";
import { IDisposable } from "../../src/Types/Contracts";
import { getLogger } from "../../src/Utility/LogUtil";
import { RavenServerLocator } from "./RavenServerLocator";
import { RavenServerRunner } from "./RavenServerRunner";
import { RevisionsConfiguration } from "../../src/Documents/Operations/RevisionsConfiguration";
import { RevisionsCollectionConfiguration } from "../../src/Documents/Operations/RevisionsCollectionConfiguration";
import {
    ConfigureRevisionsOperation,
    ConfigureRevisionsOperationResult
} from "../../src/Documents/Operations/Revisions/ConfigureRevisionsOperation";
import { Dog, Entity, Genre, Movie, Rating, User } from "../Assets/Graph";
import { RequestExecutor } from "../../src/Http/RequestExecutor";
import * as proxyAgent from "http-proxy-agent";
import * as http from "http";
import { Stopwatch } from "../../src/Utility/Stopwatch";
import { delay } from "../../src/Utility/PromiseUtil";
import * as open from "open";

const log = getLogger({ module: "TestDriver" });

export abstract class RavenTestDriver {

    private _serverVersion: string;

    public get serverVersion() {
        return this._serverVersion;
    }

    protected _disposed: boolean = false;

    public isDisposed(): boolean {
        return this._disposed;
    }

    public static debug: boolean;

    public enableFiddler(): IDisposable {
        RequestExecutor.requestPostProcessor = (req) => {
            req.agent = new proxyAgent.HttpProxyAgent("http://127.0.0.1:8888") as unknown as http.Agent;
        };

        return {
            dispose() {
                RequestExecutor.requestPostProcessor = null;
            }
        };
    }

    protected _setupDatabase(documentStore: IDocumentStore): Promise<void> {
        return Promise.resolve();
    }

    protected _runServerInternal(locator: RavenServerLocator,
                                 processRef: (process: ChildProcess) => void,
                                 configureStore: (store: DocumentStore) => void): Promise<IDocumentStore> {

        log.info("Run global server");
        const process = RavenServerRunner.run(locator);
        processRef(process);

        process.once("exit", (code, signal) => {
            log.info("Exiting.");
        });

        const scrapServerUrl = () => {
            const SERVER_VERSION_REGEX = /Version (4.\d)/;
            const SERVER_URL_REGEX = /Server available on:\s*(\S+)\s*$/m;
            const serverProcess = process;
            let serverOutput = "";
            const result = new BluebirdPromise<string>((resolve, reject) => {
                serverProcess.stderr
                    .on("data", (chunk) => serverOutput += chunk);
                serverProcess.stdout
                    .on("data", (chunk) => {
                        serverOutput += chunk;

                        const serverVersionMatch = serverOutput.match(SERVER_VERSION_REGEX);
                        if (serverVersionMatch && serverVersionMatch.length) {
                            this._serverVersion = serverVersionMatch[1];
                        }

                        try {
                            const regexMatch = serverOutput.match(SERVER_URL_REGEX);
                            if (!regexMatch) {
                                return;
                            }

                            const data = regexMatch[1];
                            if (data) {
                                resolve(data);
                            }
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on("error", (err) => reject(err));
            });

            // timeout if url won't show up after 5s
            return result
                // tslint:disable-next-line:no-console
                .tap(url => console.log("DEBUG: RavenDB server URL", url))
                .timeout(5000)
                .catch((err) => {
                    throwError("UrlScrappingError", "Error scrapping URL from server process output: "
                        + os.EOL + serverOutput, err);
                });
        };

        return Promise.resolve()
            .then(() => scrapServerUrl())
            .catch((err) => {
                try {
                    process.kill("SIGKILL");
                } catch (processKillErr) {
                    log.error(processKillErr);
                }

                throwError("InvalidOperationException", "Unable to start server.", err);
            })
            .then((serverUrl: string) => {
                const store = new DocumentStore([serverUrl], "test.manager");
                store.conventions.disableTopologyUpdates = true;

                if (configureStore) {
                    configureStore(store);
                }

                return store.initialize();
            });
    }

    public waitForIndexing(store: IDocumentStore): Promise<void>;
    public waitForIndexing(store: IDocumentStore, database?: string): Promise<void>;
    public waitForIndexing(store: IDocumentStore, database?: string, timeout?: number): Promise<void>;
    public waitForIndexing(
        store: IDocumentStore, database?: string, timeout?: number, throwOnIndexErrors?: boolean): Promise<void>;
    public waitForIndexing(
        store: IDocumentStore,
        database?: string,
        timeout?: number,
        throwOnIndexErrors: boolean = true): Promise<void> {
        const admin = store.maintenance.forDatabase(database);

        if (!timeout) {
            timeout = 60 * 1000; // minute
        }

        const isIndexingDone = (): Promise<boolean> => {
            return Promise.resolve()
                .then(() => admin.send(new GetStatisticsOperation()))
                .then((dbStats: DatabaseStatistics) => {
                    const indexes = dbStats.Indexes.filter(x => x.State !== "Disabled");

                    const errIndexes = indexes.filter(x => x.State === "Error");
                    if (errIndexes.length && throwOnIndexErrors) {
                        throwError("IndexInvalidException",
                            `The following indexes are erroneous: ${errIndexes.map(x => x.Name).join(", ")}`);
                    }

                    return indexes.every(x => !x.IsStale
                        && !x.Name.startsWith(CONSTANTS.Documents.Indexing.SIDE_BY_SIDE_INDEX_NAME_PREFIX));
                });
        };

        const pollIndexingStatus = () => {
            log.info("Waiting for indexing...");
            return BluebirdPromise.resolve()
                .then(() => isIndexingDone())
                .then(indexingDone => {
                    if (!indexingDone) {
                        return BluebirdPromise.resolve()
                            .delay(100)
                            .then(() => pollIndexingStatus());
                    } else {
                        log.info("Done waiting for indexing.");
                    }
                });
        };

        const result = BluebirdPromise.resolve(pollIndexingStatus())
            .timeout(timeout)
            .tapCatch((err) => {
                log.warn(err, "Wait for indexing timeout.");
            });

        return Promise.resolve(result);
    }

    public async waitForValue<T>(act: () => Promise<T>, expectedValue: T, opts: { timeout?: number; equal?: (a: T, b: T) => boolean } = {}) {
        const timeout = opts.timeout ?? 15_000;
        const identity = (a, b) => a === b;
        const compare = opts.equal ?? identity;

        const sw = Stopwatch.createStarted();

        do {
            try {
                const currentVal = await act();
                if (compare(expectedValue, currentVal)) {
                    return currentVal;
                }

                if (sw.elapsed > timeout) {
                    return currentVal;
                }
            } catch (e) {
                if (sw.elapsed > timeout) {
                    throwError("InvalidOperationException", e);
                }
            }
            await delay(16);
        } while (true);
    }

    protected static _killProcess(p: ChildProcess) {
        if (p && !p.killed) {
            log.info("Kill global server");

            try {
                p.kill();
            } catch (err) {
                log.error(err);
            }
        }
    }

    public async waitForUserToContinueTheTest(store: IDocumentStore) {
        const databaseNameEncoded = encodeURIComponent(store.database);
        const documentsPage = store.urls[0] + "/studio/index.html#databases/documents?&database="
            + databaseNameEncoded + "&withStop=true";

        this._openBrowser(documentsPage);

        do {
            await delay(500);

            const session = store.openSession();
            if (await session.load("Debug/Done")) {
                break;
            }
        } while (true);
    }

    protected _openBrowser(url: string): void {
        // tslint:disable-next-line:no-console
        console.log(url);

        if (os.platform() === "win32") {
            // noinspection JSIgnoredPromiseFromCall
            open(url);
        } else {
            spawn("xdg-open", [url], {
                detached: true
            });
        }
    }

    public setupRevisions(
        store: IDocumentStore,
        purgeOnDelete: boolean,
        minimumRevisionsToKeep: number): Promise<ConfigureRevisionsOperationResult> {

        const revisionsConfiguration = new RevisionsConfiguration();
        const defaultConfiguration = new RevisionsCollectionConfiguration();
        defaultConfiguration.purgeOnDelete = purgeOnDelete;
        defaultConfiguration.minimumRevisionsToKeep = minimumRevisionsToKeep;

        revisionsConfiguration.defaultConfig = defaultConfiguration;
        const operation = new ConfigureRevisionsOperation(revisionsConfiguration);
        return store.maintenance.send(operation);
    }

    public async createSimpleData(store: IDocumentStore) {
        {
            const session = store.openSession();

            const entityA = Object.assign(new Entity(), {
                Id: "entity/1",
                name: "A"
            });

            const entityB = Object.assign(new Entity(), {
                Id: "entity/2",
                name: "B"
            });

            const entityC = Object.assign(new Entity(), {
                Id: "entity/3",
                name: "C"
            });

            await session.store(entityA);
            await session.store(entityB);
            await session.store(entityC);

            entityA.references = entityB.Id;
            entityB.references = entityC.Id;
            entityC.references = entityA.Id;

            await session.saveChanges();
        }
    }

    public async createDogDataWithoutEdges(store: IDocumentStore) {
        {
            const session = store.openSession();

            const arava = Object.assign(new Dog(), {
                name: "Arava"
            });

            const oscar = Object.assign(new Dog(), {
                name: "Oscar"
            });

            const pheobe = Object.assign(new Dog(), {
                name: "Pheobe"
            });

            await session.store(arava);
            await session.store(oscar);
            await session.store(pheobe);

            await session.saveChanges();
        }
    }

    public async createDataWithMultipleEdgesOfTheSameType(store: IDocumentStore) {
        {
            const session = store.openSession();

            const arava = Object.assign(new Dog(), {
                name: "Arava"
            });

            const oscar = Object.assign(new Dog(), {
                name: "Oscar"
            });

            const pheobe = Object.assign(new Dog(), {
                name: "Pheobe"
            });

            await session.store(arava);
            await session.store(oscar);
            await session.store(pheobe);

            //dogs/1 => dogs/2
            arava.likes = [ oscar.Id ];
            arava.dislikes = [ pheobe.Id ];

            //dogs/2 => dogs/2,dogs/3 (cycle!)
            oscar.likes = [ oscar.Id, pheobe.Id ];
            oscar.dislikes = [];

            //dogs/3 => dogs/2
            pheobe.likes = [ oscar.Id ];
            pheobe.dislikes = [ arava.Id ];

            await session.saveChanges();
        }
    }

    public async createMoviesData(store: IDocumentStore) {
        {
            const session = store.openSession();

            const scifi = Object.assign(new Genre(), {
                name: "Sci-Fi",
                Id: "genres/1"
            });

            const fantasy = Object.assign(new Genre(), {
                Id: "genres/2",
                name: "Fantasy"
            });

            const adventure = Object.assign(new Genre(), {
                Id: "genres/3",
                name: "Adventure"
            });

            await session.store(scifi);
            await session.store(fantasy);
            await session.store(adventure);

            const starwars = Object.assign(new Movie(), {
                Id: "movies/1",
                name: "Star Wars Ep.1",
                genres: [ "genres/1", "genres/2" ]
            });

            const firefly = Object.assign(new Movie(), {
                Id: "movies/2",
                name: "Firefly Serenity",
                genres: [ "genres/2", "genres/3" ]
            });

            const indianaJones = Object.assign(new Movie(), {
                Id: "movies/3",
                name: "Indiana Jones and the Temple Of Doom",
                genres: [ "genres/3" ]
            });

            await session.store(starwars);
            await session.store(firefly);
            await session.store(indianaJones);

            const user1 = Object.assign(new User(), {
                Id: "users/1",
                name: "Jack"
            });

            const rating11 = Object.assign(new Rating(), {
                movie: "movies/1",
                score: 5
            });

            const rating12 = Object.assign(new Rating(), {
                movie: "movies/2",
                score: 7
            });

            user1.hasRated = [ rating11, rating12 ];
            await session.store(user1);

            const user2 = Object.assign(new User(), {
                Id: "users/2",
                name: "Jill"
            });

            const rating21 = Object.assign(new Rating(), {
                movie: "movies/2",
                score: 7
            });

            const rating22 = Object.assign(new Rating(), {
                movie: "movies/3",
                score: 9
            });

            user2.hasRated = [ rating21, rating22 ];

            await session.store(user2);

            const user3 = Object.assign(new User(), {
                Id: "users/3",
                name: "Bob"
            });

            const rating31 = Object.assign(new Rating(), {
                movie: "movies/3",
                score: 5
            });

            user3.hasRated = [ rating31 ];

            await session.store(user3);

            await session.saveChanges();
        }
    }
}
