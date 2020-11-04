import { PatchStatus } from "./PatchStatus";

export class PatchResult {

    public Status: PatchStatus;
    public ModifiedDocument: object;
    public OriginalDocument: object;
    public Debug: object;

    public ChangeVector: string;
    public Collection: string;
    public LastModified: Date;
}
