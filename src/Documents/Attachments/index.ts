import * as stream from "readable-stream";
import { HttpResponse } from "../../Primitives/Http";
import { closeHttpResponse } from "../../Utility/HttpUtil";

export type AttachmentType = "Document" | "Revision";

export interface AttachmentName {
    Name: string;
    Hash: string;
    ContentType: string;
    Size: number;
}

export interface AttachmentDetails extends AttachmentName {
    ChangeVector: string;
    DocumentId?: string;
}

export class AttachmentResult {

    constructor(
        public data: stream.Readable,
        public details: AttachmentDetails,
        private _response: HttpResponse) {
    }

    public dispose() {
        return closeHttpResponse(this._response);
    }
}

export type AttachmentData = stream.Readable | Buffer;
