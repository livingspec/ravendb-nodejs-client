import { RavenCommand } from "../../Http/RavenCommand";
import { IDocumentStore } from "../../Documents/IDocumentStore";
import { DocumentConventions } from "../../Documents/Conventions/DocumentConventions";
import { HttpCache } from "../../Http/HttpCache";

export type OperationResultType = "OperationId" | "CommandResult" | "PatchResult";

export interface IAbstractOperation {
    resultType: OperationResultType;
}

export interface IOperation<TResult> extends IAbstractOperation {
    getCommand(store: IDocumentStore, conventions: DocumentConventions, httpCache: HttpCache): RavenCommand<TResult>;
}

export interface IAwaitableOperation extends IOperation<OperationIdResult> {
}

export interface IMaintenanceOperation<TResult> extends IAbstractOperation {
    getCommand(conventions: DocumentConventions): RavenCommand<TResult>;
}

export interface IServerOperation<TResult> extends IAbstractOperation {
    getCommand(conventions: DocumentConventions): RavenCommand<TResult>;
}

export abstract class AbstractAwaitableOperation {
    get resultType(): OperationResultType {
        return "OperationId";
    }
}

export class AwaitableServerOperation
    extends AbstractAwaitableOperation
    implements IServerOperation<OperationIdResult> {

    public getCommand(conventions: DocumentConventions): RavenCommand<OperationIdResult> {
        throw new Error("getCommand() must be implemented in extending class.");
    }
}

export class AwaitableMaintenanceOperation
    extends AbstractAwaitableOperation
    implements IMaintenanceOperation<OperationIdResult> {

    public getCommand(conventions: DocumentConventions): RavenCommand<OperationIdResult> {
        throw new Error("getCommand() must be implemented in extending class.");
    }
}

export class AwaitableOperation
    extends AbstractAwaitableOperation
    implements IOperation<OperationIdResult> {

    public getCommand(
        store: IDocumentStore,
        conventions: DocumentConventions,
        httpCache: HttpCache): RavenCommand<OperationIdResult> {
        throw new Error("getCommand() must be implemented in extending class.");
    }
}

export interface OperationIdResult {
    OperationId: number;
    OperationNodeTag: string;
}

export class OperationExceptionResult {
    public Type: string;
    public Message: string;
    public Error: string;
    public StatusCode: number;
}
