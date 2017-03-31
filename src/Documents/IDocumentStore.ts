import {DocumentKey, IDocument, IDocumentType} from './IDocument';
import {IDocumentSession} from "./Session/IDocumentSession";
import {RequestsExecutor} from '../Http/Request/RequestsExecutor';
import {DocumentConventions} from './Conventions/DocumentConventions';
import {EntityKeyCallback} from '../Utility/Callbacks';
import * as Promise from 'bluebird';
import {Operations} from "../Database/Operations/Operations";

export interface IDocumentStore {
  database: string;
  operations: Operations;
  conventions: DocumentConventions<IDocument>;
  initialize(): IDocumentStore;
  openSession(database?: string, forceReadFromMaster?: boolean) : IDocumentSession;
  generateId(entity: IDocument, documentType?: IDocumentType, database?: string, callback?: EntityKeyCallback): Promise<DocumentKey>;
  getRequestsExecutor(database?: string): RequestsExecutor;
}