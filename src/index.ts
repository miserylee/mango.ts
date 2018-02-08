import { Connection, Schema } from 'mongoose';
import plugin, { IPluggedDocument, IPluggedModel } from './plugin';
import recycle, { IRecycleModel } from './recycle';
import transaction, { IError, ITransactionDocument, ITransactionModel } from './transaction';
import { IObjectId } from './types';

export interface IMango {
  Recycle: IRecycleModel;
  Transaction: ITransactionModel;
  plugin: (schema: Schema) => void;
}

export * from './types';
export * from './plugin';
export * from './recycle';
export * from './transaction';

export interface IHooks {
  didInstanceCreated?: (instance: IMango) => void;
  didDocumentLocked?: <T extends IPluggedDocument>(tid: IObjectId, model: IPluggedModel<T>, doc: T) => void;
  didTransactionInitialized?: (t: ITransactionDocument, mark: string, memo: any) => void;
  didTransactionPended?: (t: ITransactionDocument, modelName: string) => void;
  didTransactionCommitted?: (t: ITransactionDocument, cost: number) => void;
  didTransactionCancelled?: (t: ITransactionDocument, cost: number, error: IError) => void;
  didTransactionCured?: (transactions: ITransactionDocument[]) => void;
}

let instance: IMango;

export default (connection: Connection, {
  didInstanceCreated = () => null,
  didDocumentLocked = () => null,
  didTransactionInitialized = () => null,
  didTransactionPended = () => null,
  didTransactionCommitted = () => null,
  didTransactionCancelled = () => null,
  didTransactionCured = () => null,

}: IHooks = {}): IMango => {
  if (!instance) {
    const Recycle = recycle(connection);
    const Transaction = transaction(connection, Recycle, {
      didTransactionInitialized,
      didTransactionPended,
      didTransactionCommitted,
      didTransactionCancelled,
      didTransactionCured,
    });
    instance = {
      Recycle,
      Transaction,
      plugin: plugin(Transaction, Recycle, { didDocumentLocked }),
    };
    didInstanceCreated(instance);
  }
  return instance;
};
