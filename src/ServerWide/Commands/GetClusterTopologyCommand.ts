import { RavenCommand } from "../../Http/RavenCommand";
import { ClusterTopology } from "../../Http/ClusterTopology";
import { HttpRequestParameters } from "../../Primitives/Http";
import { ServerNode } from "../../Http/ServerNode";
import * as stream from "readable-stream";
import { NodeStatus } from "../../Http/RequestExecutor";

export class ClusterTopologyResponse {
    public Leader: string;
    public NodeTag: string;
    public Topology: ClusterTopology;
    public Etag: number;
    public Status: Map<string, NodeStatus>;
}

export class GetClusterTopologyCommand extends RavenCommand<ClusterTopologyResponse> {

    private readonly _debugTag: string;

    public constructor(debugTag?: string) {
        super();

        this._debugTag = debugTag;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        let uri = node.Url + "/cluster/topology";

        if (this._debugTag) {
            uri += "?" + this._debugTag;
        }

        return { uri };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        let body: string = null;
        await this._pipeline<ClusterTopologyResponse>()
            .collectBody(b => body = b)
            .parseJsonSync()
            .process(bodyStream)
            .then(result => {
                const clusterTpl = Object.assign(new ClusterTopology(), result.Topology);
                this.result = Object.assign(result as ClusterTopologyResponse, { Topology: clusterTpl });
                this.result.Status = new Map(Object.entries(this.result.Status));
            });
        return body;
    }

    public get isReadRequest() {
        return true;
    }
}
