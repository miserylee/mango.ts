import { Connection, Schema } from 'mongoose';
import mango, { IRecycleModel, ITransactionModel } from '../../src';
import connection from './connection';

const mangoInstance: {
  Recycle: IRecycleModel;
  Transaction: ITransactionModel;
  plugin: (schema: Schema) => void;
  connection: Connection
} = {
  ...mango(connection, {
    didInstanceCreated: _ => console.log('instance created'),
    didDocumentLocked: (tid, model, doc) => console.log(`doc ${model.modelName}[${doc._id}] locked by ${tid}`),
    didTransactionInitialized: (t, mark) => console.log(`transaction [${t._id}] initialized. ${mark}`),
    didTransactionPended: (t, modelName) => console.log(`transaction [${t._id}] pended ${modelName}`),
    didTransactionCommitted: (t, cost) => console.log(`transaction [${t._id}] committed cost ${cost}ms`),
    didTransactionCancelled: (t, cost, error) =>
      console.log(`transaction [${t._id}] cancelled cost ${cost}ms, ${error.message}`),
    didTransactionCured: transactions => console.log('cured transactions'),
  }),
  connection,
};

export = mangoInstance;
