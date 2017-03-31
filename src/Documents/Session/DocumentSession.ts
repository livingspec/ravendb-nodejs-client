import {IDocumentSession} from "./IDocumentSession";
import {IDocumentQuery} from "./IDocumentQuery";
import {DocumentQuery} from "./DocumentQuery";
import {Document} from '../Document';
import {IDocument, DocumentKey, IDocumentType} from '../IDocument';
import {IDocumentStore} from '../IDocumentStore';
import {RequestsExecutor} from '../../Http/Request/RequestsExecutor';
import {DocumentConventions} from '../Conventions/DocumentConventions';
import {EntityCallback, EntitiesArrayCallback} from '../../Utility/Callbacks';
import {PromiseResolve, PromiseResolver, PromiseReject} from '../../Utility/PromiseResolver';
import * as _ from 'lodash';
import * as Promise from 'bluebird'
import {TypeUtil} from "../../Utility/TypeUtil";
import {IMetadata} from "../../Database/Metadata";
import { InvalidOperationException, DocumentDoesNotExistsException, RavenException} from "../../Database/DatabaseExceptions";
import {StringUtil} from "../../Utility/StringUtil";
import {GetDocumentCommand} from "../../Database/Commands/GetDocumentCommand";
import {IRavenCommandResponse} from "../../Database/IRavenCommandResponse";
import {DeleteDocumentCommand} from "../../Database/Commands/DeleteDocumentCommand";

export class DocumentSession implements IDocumentSession {
  protected database: string;
  protected documentStore: IDocumentStore;
  protected requestsExecutor: RequestsExecutor;
  protected sessionId: string;
  protected forceReadFromMaster: boolean;
  private _numberOfRequestsInSession: number;

  public get numberOfRequestsInSession(): number {
    return this._numberOfRequestsInSession;
  }

  public get conventions(): DocumentConventions<IDocument> {
    return this.documentStore.conventions;
  }       

  constructor (database: string, documentStore: IDocumentStore, requestsExecutor: RequestsExecutor,
     sessionId: string, forceReadFromMaster: boolean
  ) {
    this.database = database;
    this.documentStore = documentStore;
    this.requestsExecutor = requestsExecutor;
    this.sessionId = sessionId;
    this.forceReadFromMaster = forceReadFromMaster;
  }

  public create(attributes?: Object, documentType?: IDocumentType): IDocument {
    let document: IDocument = new Document(attributes);
    const conventions: DocumentConventions<IDocument> = this.documentStore.conventions;

    document['@metadata'] = conventions.buildDefaultMetadata(document, documentType);
    return document;
  }

  public load(keyOrKeys: DocumentKey | DocumentKey[], includes?: string[], callback?: EntityCallback<IDocument>
    | EntitiesArrayCallback<IDocument>
  ): Promise<IDocument> | Promise<IDocument[]> {
    this.incrementRequestsCount();

    return this.requestsExecutor
      .execute(new GetDocumentCommand(keyOrKeys, includes))
      .then((response: IRavenCommandResponse) => {
        let responseResults: Object[];

        if (_.isEmpty(keyOrKeys)) {
          return Promise.reject(new InvalidOperationException('Document key isn\'t set or keys list is empty'));
        }

        if (includes && !TypeUtil.isArray(includes)) {
          includes = _.isString(includes) ? [includes as string] : null;
        }

        if (!(responseResults = response.Results) || (responseResults.length <= 0)) {
          return Promise.reject(new DocumentDoesNotExistsException('Requested document(s) doesn\'t exists'));
        }

        const results = responseResults.map((result: Object) => this
          .conventions.tryConvertToDocument(result).document);

        const result = TypeUtil.isArray(keyOrKeys)
          ? _.first(results) as IDocument
          : results as IDocument[];

        PromiseResolver.resolve<IDocument | IDocument[]>(result, null, callback);
        return result;
      })
      .catch((error: RavenException) => PromiseResolver.reject(error, null, callback));
  }

  public delete(keyOrEntity: DocumentKey | IDocument, callback?: EntityCallback<IDocument>): Promise<IDocument> {
    this.incrementRequestsCount();

    return this.prefetchDocument(keyOrEntity)
    .then((document: IDocument) => {
      let etag: number | null = null;
      const conventions = this.conventions;
      const metadata: IMetadata = document['@metadata'];
      const key: DocumentKey = conventions.tryGetIdFromInstance(document);

      if ('Raven-Read-Only' in metadata) {
        return Promise.reject(new InvalidOperationException('Document is marked as read only and cannot be deleted'));
      }

      if (conventions.defaultUseOptimisticConcurrency) {
        etag = metadata['@tag'] || null;
      }

      return this.requestsExecutor
        .execute(new DeleteDocumentCommand(key, etag))
        .then(() => {
          PromiseResolver.resolve<IDocument>(document, null, callback);
          return document;
        }) as Promise<IDocument>;
    })
    .catch((error: RavenException) => PromiseResolver.reject(error, null, callback));
  }

  public store(entity: IDocument, documentType?: IDocumentType, key?: DocumentKey, etag?: number, forceConcurrencyCheck?: boolean,
     callback?: EntityCallback<IDocument>
  ): Promise<IDocument> {
    this.incrementRequestsCount();
    const result = this.create();

    return new Promise<IDocument>((resolve: PromiseResolve<IDocument>) =>
      PromiseResolver.resolve(result, resolve, callback)
    );
  }

  public query(documentType?: IDocumentType, indexName?: string, usingDefaultOperator?: boolean, waitForNonStaleResults: boolean = false,
     includes?: string[], withStatistics: boolean = false
  ): IDocumentQuery {
    return new DocumentQuery(this, this.requestsExecutor, documentType);
  }

  public incrementRequestsCount(): void {
    const maxRequests: number = this.conventions.maxNumberOfRequestPerSession;

    this._numberOfRequestsInSession++;

    if (this._numberOfRequestsInSession > maxRequests) {
      throw new InvalidOperationException(StringUtil.format(
        "The maximum number of requests ({0}) allowed for this session has been reached. Raven limits the number \
        of remote calls that a session is allowed to make as an early warning system. Sessions are expected to \
        be short lived, and Raven provides facilities like batch saves (call save_changes() only once).\
        You can increase the limit by setting DocumentConvention.\
        MaxNumberOfRequestsPerSession or MaxNumberOfRequestsPerSession, but it is advisable \
        that you'll look into reducing the number of remote calls first, \
        since that will speed up your application significantly and result in a\
        more responsive application.", maxRequests
      ));
    }
  }

  protected prefetchDocument(keyOrEntity: DocumentKey | IDocument): Promise<IDocument> {
    if (keyOrEntity instanceof Document) {
      return Promise.resolve(keyOrEntity) as Promise<IDocument>;
    }

    return this.load(keyOrEntity as DocumentKey) as Promise<IDocument>;
  }

  protected prepareDocumentToStore(entity: IDocument, documentType?: IDocumentType, key?: DocumentKey,
    etag?: number, forceConcurrencyCheck?: boolean
  ): Promise<IDocument> {
    if (!entity || !(entity instanceof Document)) {
      return Promise.reject(
        new InvalidOperationException('Document must be set and be an insstance of IDocument')
      ) as Promise<IDocument>;
    }

    return Promise.resolve(entity)
      .then((entity: IDocument) => {
        entity['@metadata']['force_concurrency_check'] = forceConcurrencyCheck || false;

        if (key && TypeUtil.isNone(etag)) {
          return this.prefetchDocument(key)
            .then((document: IDocument) => {
              entity['@metadata']['@tag'] = document['@metadata']['@tag'];
              return entity;
            });
        }

        entity['@metadata']['@tag'] = etag;
        return entity;
      })
      .then((entity: IDocument) => {
        let documentKey: DocumentKey = key;
        const conventions = this.conventions;

        if (TypeUtil.isNone(documentKey)) {
          documentKey = conventions.tryGetIdFromInstance(entity);
        } else {
          conventions.trySetIdOnEntity(entity, documentKey);
        }

        if (TypeUtil.isNone(documentKey)) {
          return this.documentStore
            .generateId(entity, documentType)
            .then((documentKey: DocumentKey): IDocument => {
              conventions.trySetIdOnEntity(entity, documentKey);
              return entity;
            })
        }

        return entity;
      });
  }
}