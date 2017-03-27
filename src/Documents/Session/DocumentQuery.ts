import {IDocument} from "../IDocument";
import {IDocumentQuery} from "./IDocumentQuery";
import {IDocumentSession} from "./IDocumentSession";
import {RequestsExecutor} from "../../Http/Request/RequestsExecutor";
import {IDocumentQueryConditions} from './IDocumentQueryConditions';
import {QueryResultsCallback} from '../../Utility/Callbacks';
import {PromiseResolve, PromiseResolver, PromiseReject} from '../../Utility/PromiseResolver';
import {EscapeQueryOption, EscapeQueryOptions} from "./EscapeQueryOptions";
import {LuceneValue, LuceneConditionValue, LuceneRangeValue} from "../Lucene/LuceneValue";
import {IRavenCommandResponse} from "../../Database/IRavenCommandResponse";
import {LuceneOperator, LuceneOperators} from "../Lucene/LuceneOperator";
import {LuceneBuilder} from "../Lucene/LuceneBuilder";
import {StringUtil} from "../../Utility/StringUtil";
import {QueryString} from "../../Http/QueryString";
import {ArrayUtil} from "../../Utility/ArrayUtil";
import {QueryOperators, QueryOperator} from "./QueryOperator";
import {DocumentConventions, IDocumentConversionResult} from "../Conventions/DocumentConventions";
import * as Promise from 'bluebird'
import * as moment from "moment";
import {IndexQuery} from "../../Database/Indexes/IndexQuery";
import {IOptionsSet} from "../../Utility/IOptionsSet";
import {QueryCommand} from "../../Database/Commands/QueryCommand";
import {TypeUtil} from "../../Utility/TypeUtil";
import {ArgumentOutOfRangeException, InvalidOperationException, ErrorResponseException} from "../../Database/DatabaseExceptions";

export type DocumentQueryResult<T> = Array<T> | {results: T[], response: IRavenCommandResponse};

export class DocumentQuery implements IDocumentQuery {
  protected indexName: string;
  protected session: IDocumentSession;
  protected requestsExecutor: RequestsExecutor;
  protected includes?: string[] = null;
  protected queryBuilder: string = '';
  protected negate: boolean = false;
  protected fetch?: string[] = null;
  protected sortHints?: string[] = null;
  protected sortFields?: string[] = null;
  protected withStatistics: boolean = false;
  protected usingDefaultOperator?: QueryOperator = null;
  protected waitForNonStaleResults: boolean = false;

  constructor(session: IDocumentSession, requestsExecutor: RequestsExecutor, indexName?: string,  usingDefaultOperator
    ?: QueryOperator, waitForNonStaleResults: boolean = false, includes?: string[], withStatistics: boolean = false
  ) {
    this.session = session;
    this.includes = includes;
    this.withStatistics = withStatistics;
    this.requestsExecutor = requestsExecutor;
    this.usingDefaultOperator = usingDefaultOperator;
    this.waitForNonStaleResults = waitForNonStaleResults;
    this.indexName = [(indexName || 'dynamic'), session.conventions.documentsCollectionName].join('/');
  }

  public select(...args: string[]): IDocumentQuery {
    if (args && args.length) {
      this.fetch = args;
    }

    return this;
  }

  public search(fieldName: string, searchTerms: string | string[], escapeQueryOptions: EscapeQueryOption = EscapeQueryOptions.RawQuery, boost: number = 1): IDocumentQuery {
    if (boost < 0) {
      throw new ArgumentOutOfRangeException('Boost factor must be a positive number');
    }

    let quotedTerms = TypeUtil.isArray(searchTerms)
      ? (searchTerms as string[]).join(' ')
      : (searchTerms as string);

    quotedTerms = QueryString.encode(quotedTerms);
    this.addLuceneCondition<string>(fieldName, quotedTerms, LuceneOperators.Search, escapeQueryOptions);

    if (boost != 1) {
      this.addStatement(StringUtil.format("^{0}", boost));
    }

    return this;
  }

  public where(conditions: IDocumentQueryConditions): IDocumentQuery {
    ArrayUtil.mapObject(conditions, (value: any, fieldName: string): any => {
      if (TypeUtil.isArray(value)) {
        this.whereIn<LuceneValue>(fieldName, value as LuceneValue[]);
      } else {
        this.whereEquals<LuceneValue>(fieldName, value as LuceneValue);
      }
    });

    return this;
  }

  public whereEquals<V extends LuceneValue>(fieldName: string, value: V, escapeQueryOptions: EscapeQueryOption = EscapeQueryOptions.EscapeAll): IDocumentQuery {
    if (!fieldName) {
      throw new InvalidOperationException('Empty field name is invalid');
    }

    this.addLuceneCondition<V>(fieldName, value, LuceneOperators.Equals, escapeQueryOptions);
    return this;
  }

  public whereEndsWith(fieldName: string, value: string): IDocumentQuery {
    if (!fieldName) {
      throw new InvalidOperationException('Empty field name is invalid');
    }

    this.addLuceneCondition<string>(fieldName, value, LuceneOperators.EndsWith);
    return this;
  }

  public whereStartsWith(fieldName: string, value: string): IDocumentQuery {
    if (!fieldName) {
      throw new InvalidOperationException('Empty field name is invalid');
    }

    this.addLuceneCondition<string>(fieldName, value, LuceneOperators.StartsWith);
    return this;
  }

  public whereIn<V extends LuceneValue>(fieldName: string, values: V[]): IDocumentQuery {
    if (!fieldName) {
      throw new InvalidOperationException('Empty field name is invalid');
    }

    this.addLuceneCondition<V[]>(fieldName, values, LuceneOperators.In);
    return this;
  }

  public whereBetween<V extends LuceneValue>(fieldName: string, start?: V, end?: V): IDocumentQuery {
    //TODO: DateTime
    if (!fieldName) {
      throw new InvalidOperationException('Empty field name is invalid');
    }

    this.addLuceneCondition<LuceneRangeValue<V>>(fieldName, {min: start, max: end}, LuceneOperators.Between);
    return this;
  }

  public whereBetweenOrEqual<V extends LuceneValue>(fieldName: string, start?: V, end?: V): IDocumentQuery {
    //TODO: DateTime
    if (!fieldName) {
      throw new InvalidOperationException('Empty field name is invalid');
    }

    this.addLuceneCondition<LuceneRangeValue<V>>(fieldName, {min: start, max: end}, LuceneOperators.EqualBetween);
    return this;
  }

  public whereGreaterThan<V extends LuceneValue>(fieldName: string, value: V): IDocumentQuery {
    return this.whereBetween<V>(fieldName, value);
  }

  public whereGreaterThanOrEqual<V extends LuceneValue>(fieldName: string, value: V): IDocumentQuery {
    return this.whereBetweenOrEqual<V>(fieldName, value);
  }

  public whereLessThan<V extends LuceneValue>(fieldName: string, value: V): IDocumentQuery {
    return this.whereBetween<V>(fieldName, null, value);
  }

  public whereLessThanOrEqual<V extends LuceneValue>(fieldName: string, value: V): IDocumentQuery {
    return this.whereBetweenOrEqual<V>(fieldName, null, value);
  }

  public whereIsNull(fieldName: string): IDocumentQuery {
    return this.whereEquals<null>(fieldName, null);
  }

  public whereNotNull(fieldName: string): IDocumentQuery {
    return this.addSpace()
      .addStatement('(')
        .whereEquals<string>(fieldName, '*')
        .andAlso()
        .addNot()
        .whereEquals<null>(fieldName, null)
    .addStatement(')');
  }

  public orderBy(fieldsNames: string|string[]): IDocumentQuery {
    const fields: string[] = TypeUtil.isArray(fieldsNames)
      ? (fieldsNames as string[])
      : [fieldsNames as string];

    fields.forEach((field) => {
      const fieldName: string = (field.charAt(0) == '-') ? field.substr(1) : field;
      let index: number = this.sortFields.indexOf(fieldName);

      if (-1 == index) {
        index = this.sortFields.indexOf(`-${fieldName}`);
      }

      if (-1 == index) {
        this.sortFields.push(field)
      } else {
        this.sortFields[index] = field;
      }
    });

    return this;
  }

  public orderByDescending(fieldsNames: string|string[]): IDocumentQuery {
    const fields: string[] = TypeUtil.isArray(fieldsNames)
      ? (fieldsNames as string[])
      : [fieldsNames as string];

    return this.orderBy(fields.map((field) => `-${field}`));
  }

  public andAlso(): IDocumentQuery {
    return this.addSpace().addStatement(QueryOperators.AND);
  }

  public orElse(): IDocumentQuery {
    return this.addSpace().addStatement(QueryOperators.OR);
  }

  public addNot(): IDocumentQuery {
    this.negate = true;

    return this;
  }

  public addSpace(): IDocumentQuery {
    if ((this.queryBuilder.length > 0) && !this.queryBuilder.endsWith(' ')) {
      this.addStatement(' ');
    }

    return this;
  }

  public addStatement(statement: string): IDocumentQuery {
    if (this.queryBuilder.length > 0) {
      this.queryBuilder += statement;
    }

    return this;
  }

  public get(callback?: QueryResultsCallback<DocumentQueryResult<IDocument>>): Promise<DocumentQueryResult<IDocument>> {
    return new Promise<DocumentQueryResult<IDocument>>((resolve: PromiseResolve<DocumentQueryResult<IDocument>>, reject: PromiseReject) =>
      this.executeQuery()
        .catch((error: Error) => reject(error))
        .then((response: IRavenCommandResponse) => {
          let result: DocumentQueryResult<IDocument> = [] as DocumentQueryResult<IDocument>;

          if (response.Results.length > 0) {
            let results: IDocument[] = [];

            response.Results.forEach((result: Object) => results.push(
              this.session.conventions
                .tryConvertToDocument(result, this.fetch)
                .document
            ));

            if (this.withStatistics) {
              result = {
                results: results,
                response: response
              } as DocumentQueryResult<IDocument>;
            } else {
              result = results as DocumentQueryResult<IDocument>;
            }
          }

          PromiseResolver.resolve<DocumentQueryResult<IDocument>>(result, resolve, callback)
        })
    );
  }

  protected executeQuery(): Promise<IRavenCommandResponse> {
    const queryOptions: IOptionsSet = {
      sort_hints: this.sortHints,
      sort_fields: this.sortFields,
      fetch: this.fetch,
      wait_for_non_stale_results: this.waitForNonStaleResults
    };

    const session: IDocumentSession = this.session;
    const conventions: DocumentConventions<IDocument> = session.conventions;
    const endTime: number = moment().unix() + conventions.timeout;
    const query: IndexQuery = new IndexQuery(this.queryBuilder, 0, 0, this.usingDefaultOperator, queryOptions);
    const queryCommand: QueryCommand = new QueryCommand(this.indexName, query, conventions, this.includes);

    return new Promise<IRavenCommandResponse>((resolve: PromiseResolve<IRavenCommandResponse>, reject: PromiseReject) => {
      const request = () => {
        this.requestsExecutor.execute(queryCommand)
          .catch((error: Error) => reject(error))
          .then((response: IRavenCommandResponse | null) => {
            if (TypeUtil.isNone(response)) {
              resolve({
                Results: [] as IDocument[],
                Includes: [] as string[]
              } as IRavenCommandResponse);
            } else if (response.IsStale && this.waitForNonStaleResults) {
              if (moment().unix() > endTime) {
                reject(new ErrorResponseException('The index is still stale after reached the timeout'));
              } else {
                setTimeout(request, 100);
              }
            } else {
              resolve(response);
            }
          });
      };

      request();
    });
  }

  protected addLuceneCondition<T extends LuceneConditionValue>(fieldName: string, condition: T,
    operator?: LuceneOperator, escapeQueryOptions: EscapeQueryOption = EscapeQueryOptions.EscapeAll
  ): void {
    const luceneCondition: string = LuceneBuilder.buildCondition<T>(this.session.conventions, fieldName,
      condition, operator, escapeQueryOptions);

    this.addSpace();

    if (this.negate) {
      this.negate = false;
      this.addStatement('-');
    }

    this.queryBuilder += luceneCondition;
  }
}