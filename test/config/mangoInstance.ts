import { Connection, Schema } from 'mongoose';
import mango from '../../src/index';
import { IRecycleModel } from '../../src/recycle';
import { ITransactionModel } from '../../src/transaction';
import connection from './connection';

const mangoInstance: {
  Recycle: IRecycleModel;
  Transaction: ITransactionModel;
  plugin: (schema: Schema) => void;
  connection: Connection
} = { ...mango(connection), connection };

export = mangoInstance;
