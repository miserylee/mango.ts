import { Connection, Schema } from 'mongoose';
import plugin from './plugin';
import recycle, { IRecycleModel } from './recycle';
import transaction, { ITransactionModel } from './transaction';

export interface IMango {
  Recycle: IRecycleModel;
  Transaction: ITransactionModel;
  plugin: (schema: Schema) => void;
}

export * from './types';
export * from './plugin';
export * from './recycle';
export * from './transaction';

let instance: IMango;

export default (connection: Connection): IMango => {
  if (!instance) {
    const Recycle = recycle(connection);
    const Transaction = transaction(connection, Recycle);
    instance = {
      Recycle,
      Transaction,
      plugin: plugin(Transaction, Recycle),
    };
  }
  return instance;
};
