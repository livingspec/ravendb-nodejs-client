import { IRavenObject } from "../Types/IRavenObject";
import { UriUtility } from "../Http/UriUtility";

export type ServerNodeRole = "None" | "Promotable" | "Member" | "Rehab";

export class ServerNode {
    public Database: string;
    public Url: string;
    public ClusterTag?: string = null;
    public ServerRole: ServerNodeRole;

    public constructor(opts?: { database?: string, url?: string, clusterTag?: string }) {
        if (opts) {
            this.Database = opts.database;
            this.Url = opts.url;
            this.ClusterTag = opts.clusterTag;
        }
    }

    public get isSecure(): boolean {
        return UriUtility.isSecure(this.Url);
    }

    public fromJson(json: object): void {
        const from: IRavenObject = json as IRavenObject;

        this.Url = from.Url;
        this.Database = from.Database || null;
        this.ClusterTag = from.ClusterTag || null;
    }

    public static fromJson(json: object): ServerNode {
        const node = new ServerNode({
            database: "",
            url: ""
        });

        node.fromJson(json);
        return node;
    }
}
