import { IMaintenanceOperation, OperationResultType } from "../OperationAbstractions";
import { IndexStats, CollectionStats } from "../../Indexes/IndexStats";
import { throwError } from "../../../Exceptions";
import { RavenCommand } from "../../../Http/RavenCommand";
import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { HttpRequestParameters } from "../../../Primitives/Http";
import * as stream from "readable-stream";
import { ServerNode } from "../../../Http/ServerNode";

export class GetIndexStatisticsOperation implements IMaintenanceOperation<IndexStats> {
    private readonly _indexName: string;

    public constructor(indexName: string) {
        if (!indexName) {
            throwError("InvalidArgumentException", "IndexName cannot be null.");
        }

        this._indexName = indexName;
    }

    public getCommand(conventions: DocumentConventions): RavenCommand<IndexStats> {
        return new GetIndexStatisticsCommand(this._indexName, conventions);
    }

    public get resultType(): OperationResultType {
        return "CommandResult";
    }

}

export class GetIndexStatisticsCommand extends RavenCommand<IndexStats> {
    private readonly _indexName: string;
    private readonly _conventions: DocumentConventions;

    public constructor(indexName: string, conventions: DocumentConventions) {
        super();

        if (!indexName) {
            throwError("InvalidArgumentException", "IndexName cannot be null.");
        }

        this._indexName = indexName;
        this._conventions = conventions;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uri = node.Url + "/databases/" + node.Database
            + "/indexes/stats?name=" + encodeURIComponent(this._indexName);
        return { uri };
    }

    public async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        let body: string = null;
        await this._defaultPipeline(_ => body = _)
            .process(bodyStream)
            .then(results => {
                for (const r of results["Results"]) {
                    r.Collections = Object.keys(r.Collections)
                        .reduce((result, next) => [ ...result, [ next, result[next] ]], []);
                }
                const responseObj = this._reviveResultTypes(
                    results, 
                    this._conventions,
                    {
                        nestedTypes: {
                            "Results[].Collections": "Map",
                            "Results[].Collections$MAP": "CollectionStats"
                        }
                    }, new Map([[CollectionStats.name, CollectionStats]]));

                const indexStatsResults = responseObj["Results"];
                if (!indexStatsResults.length) {
                    this._throwInvalidResponse();
                }

                this.result = indexStatsResults[0];
            });
        return body;
    }

    public get isReadRequest(): boolean {
        return true;
    }
}
