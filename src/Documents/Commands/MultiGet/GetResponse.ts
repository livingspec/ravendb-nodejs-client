import { StatusCodes } from "../../../Http/StatusCode";

export class GetResponse {
    public constructor() {
        this._headers = {};
    }

    private _elapsed: number;
    private _result: string;
    private _headers: { [key: string]: string };
    private _statusCode: number;
    private _forceRetry;

    public static create(data: object) {
        return Object.assign(new GetResponse(), data);
    }

    public get Elapsed(): number {
        return this._elapsed;
    }

    public set Elapsed(elapsed: number) {
        this._elapsed = elapsed;
    }

    /**
     * Response result as JSON.
     */
    public get Result(): string {
        return this._result;
    }

    /**
     * Response result as JSON.
     */
    public set Result(result: string) {
        this._result = result;
    }

    /**
     * Request headers.
     */
    public get Headers(): { [key: string]: string } {
        return this._headers;
    }

    /**
     * Request headers.
     */
    public set Headers(headers: { [key: string]: string }) {
        this._headers = headers;
    }

    /**
     * Response HTTP status code.
     */
    public get StatusCode(): number {
        return this._statusCode;
    }

    /**
     * Response HTTP status code.
     */
    public set StatusCode(statusCode) {
        this._statusCode = statusCode;
    }

    /**
     * Indicates if request should be retried (forced).
     */
    public get ForceRetry(): boolean {
        return this._forceRetry;
    }

    /**
     * Indicates if request should be retried (forced).
     */
    public set ForceRetry(forceRetry) {
        this._forceRetry = forceRetry;
    }

    /**
     * Method used to check if request has errors.
     */
    public requestHasErrors(): boolean {
        switch (this._statusCode) {
            case 0:
            case StatusCodes.Ok:
            case StatusCodes.Created:
            case StatusCodes.NonAuthoritativeInformation:
            case StatusCodes.NoContent:
            case StatusCodes.NotModified:
            case StatusCodes.NotFound:
                return false;
            default:
                return true;
        }
    }
}
