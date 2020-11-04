import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { throwError } from "../../../Exceptions";
import { TypeUtil } from "../../../Utility/TypeUtil";
import { ClassConstructor } from "../../../Types";

export interface CompareExchangeResultResponse {
    Index: number;
    Successful: boolean;
    Value: {
        Object: object
    };
}

export class CompareExchangeResult<T> {

    public value: T;
    public index: number;
    public successful: boolean;

    public static parseFromObject<T>(
        { Index, Value, Successful }: CompareExchangeResultResponse,
        conventions: DocumentConventions,
        clazz?: ClassConstructor<T>): CompareExchangeResult<T> {
        if (!Index) {
            throwError("InvalidOperationException", "Response is invalid. Index is missing");
        }

        const val = Value.Object || null;
        return CompareExchangeResult._create(val, Index, Successful, conventions, clazz);
    }

    public static parseFromString<T>(
        responseString: string,
        conventions: DocumentConventions,
        clazz?: ClassConstructor<T>): CompareExchangeResult<T> {

        const response = JSON.parse(responseString);

        const index = response["Index"];
        if (!index) {
            throwError("InvalidOperationException", "Response is invalid. Index is missing");
        }

        const successful = response["Successful"];
        const raw = response["Value"];

        let val = null;

        if (raw) {
            val = raw["Object"];
        }

        return CompareExchangeResult._create(val, index, successful, conventions, clazz);
    }

    private static _create<T>(
        val: any,
        index: number,
        successful: boolean,
        conventions: DocumentConventions,
        clazz?: ClassConstructor<T>): CompareExchangeResult<T> {

        conventions.tryRegisterJsType(clazz);

        if (!val) {
            const emptyExchangeResult = new CompareExchangeResult<T>();
            emptyExchangeResult.index = index;
            emptyExchangeResult.value = null;
            emptyExchangeResult.successful = successful;
            return emptyExchangeResult;
        }

        let result: T;
        if (TypeUtil.isPrimitive(val)) {
            result = val as any as T;
        } else {
            // val comes here with proper key case already
            const entityType = conventions.getJsTypeByDocumentType(clazz);
            result = conventions.deserializeEntityFromJson(entityType, val) as any as T;
        }

        const exchangeResult = new CompareExchangeResult<T>();
        exchangeResult.index = index;
        exchangeResult.value = result;
        exchangeResult.successful = successful;
        return exchangeResult;
    }
}
