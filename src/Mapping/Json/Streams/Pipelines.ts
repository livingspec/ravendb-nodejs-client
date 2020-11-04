import * as stream from "readable-stream";
import { RavenCommandResponsePipeline } from "../../../Http/RavenCommandResponsePipeline";
import { DocumentConventions } from "../../../Documents/Conventions/DocumentConventions";
import * as BluebirdPromise from "bluebird";

export function getDocumentResultsAsObjects(
    conventions: DocumentConventions, includeStatistics: boolean): RavenCommandResponsePipeline<object[]> {

    return RavenCommandResponsePipeline.create<object[]>()
        .parseJsonResultsStream(includeStatistics);
}

export function getDocumentResultsPipeline(
    conventions: DocumentConventions): RavenCommandResponsePipeline<object[]> {
    return RavenCommandResponsePipeline.create<object[]>()
        .streamResponse();
}

export async function streamResultsIntoStream(
    bodyStream: stream.Stream,
    conventions: DocumentConventions,
    writable: stream.Writable): Promise<void> {

    return new BluebirdPromise<void>((resolve, reject) => {
        getDocumentResultsPipeline(conventions)
            .stream(bodyStream, writable, (err) => {
                err ? reject(err) : resolve();
            });
    });
}
