import { IMaintenanceOperation, OperationResultType } from "../OperationAbstractions";
import { GetPeriodicBackupStatusOperationResult } from "./GetPeriodicBackupStatusOperationResult";
import { HttpRequestParameters } from "../../../Primitives/Http";
import * as stream from "readable-stream";
import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { RavenCommand } from "../../../Http/RavenCommand";
import { ServerNode } from "../../../Http/ServerNode";

export class GetPeriodicBackupStatusOperation implements IMaintenanceOperation<GetPeriodicBackupStatusOperationResult> {
    private readonly _taskId: number;

    public constructor(taskId: number) {
        this._taskId = taskId;
    }

    public get resultType(): OperationResultType {
        return "CommandResult";
    }

    public getCommand(conventions: DocumentConventions): RavenCommand<GetPeriodicBackupStatusOperationResult> {
        return new GetPeriodicBackupStatusCommand(this._taskId, conventions);
    }
}

class GetPeriodicBackupStatusCommand extends RavenCommand<GetPeriodicBackupStatusOperationResult> {
    private readonly _taskId: number;
    private readonly _conventions: DocumentConventions;

    public constructor(taskId: number, conventions: DocumentConventions) {
        super();

        this._taskId = taskId;
        this._conventions = conventions;
    }

    createRequest(node: ServerNode): HttpRequestParameters {
        const uri = node.Url + "/periodic-backup/status?name=" + node.Database + "&taskId=" + this._taskId;

        return {
            method: "GET",
            uri
        }
    }

    get isReadRequest(): boolean {
        return true;
    }

    async setResponseAsync(bodyStream: stream.Stream, fromCache: boolean): Promise<string> {
        if (!bodyStream) {
            this._throwInvalidResponse();
        }

        let body: string = null;
        await this._defaultPipeline(_ => body = _)
            .process(bodyStream)
            .then(results => {
                this.result = this._reviveResultTypes<GetPeriodicBackupStatusOperationResult>(
                    results,
                    this._conventions,
                    {
                        nestedTypes: {
                            "Status.LastFullBackup": "date",
                            "Status.LastIncrementalBackup": "date",
                            "Status.LastFullBackupInternal": "date",
                            "Status.LastIncrementalBackupInternal": "date",
                            "Status.LocalBackup.LastIncrementalBackup": "date",
                            "Status.LocalBackup.LastFullBackup": "date",
                            "Status.NextBackup.DateTime": "date",
                            "Status.OnGoingBackup.StartTime": "date",
                            "Status.Error.At": "date"
                        }
                    });
            });
        return body;
    }
}
