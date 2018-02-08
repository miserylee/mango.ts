import { Connection, Document, Model, Schema, SchemaDefinition } from 'mongoose';
import * as timestamp from 'mongoose-timestamp';
import { IRecycleModel } from './recycle';
import { IObjectId } from './types';

export interface IError extends Error {
  type: string;
}

const TRANSACTION_STATE = {
  initialized: 'initialized',
  pending: 'pending',
  committed: 'committed',
  finished: 'finished',
  rollback: 'rollback',
  cancelled: 'cancelled',
};

const definition: SchemaDefinition = {
  state: {
    type: String,
    required: true,
    enums: Object.keys(TRANSACTION_STATE),
    default: TRANSACTION_STATE.initialized,
  },
  models: [],
  error: {
    message: String,
    stack: String,
    type: { type: String },
    name: String,
  },
  mark: String,
  memo: {},
  initializedAt: Date,
  cost: Number,
};

export interface ITransactionDocument extends Document {
  state: string;
  models: string[];
  error: {
    message: string;
    stack: string;
    type: string;
    name: string;
  };
  mark: string;
  memo: any;
  initializedAt: Date;
  cost: string;
}

export interface ITransactionModel extends Model<ITransactionDocument> {
  bindModel<T>(UsedModel: T): T;

  _checkModel(modelName: string): Model<any>;

  initialize(mark?: string, memo?: any): IObjectId;

  pend(id: IObjectId, modelName: string): void;

  commit(id: IObjectId): void;

  cancel(id: IObjectId, error: IError): void;

  try<T extends any>(fn: (tid: IObjectId) => T, mark?: string, memo?: any): T;

  cure(timeout?: number): void;
}

export default (connection: Connection, Recycle: IRecycleModel, {
  didTransactionInitialized = () => null,
  didTransactionPended = () => null,
  didTransactionCommitted = () => null,
  didTransactionCancelled = () => null,
  didTransactionCured = () => null,
}: {
  didTransactionInitialized?: (t: ITransactionDocument, mark: string, memo: any) => void;
  didTransactionPended?: (t: ITransactionDocument, modelName: string) => void;
  didTransactionCommitted?: (t: ITransactionDocument, cost: number) => void;
  didTransactionCancelled?: (t: ITransactionDocument, cost: number, error: IError) => void;
  didTransactionCured?: (transactions: ITransactionDocument[]) => void;
} = {}): ITransactionModel => {
  const schema = new Schema(definition);

  schema.index({ _id: 1, state: 1 });

  schema.plugin(timestamp);

  schema.statics.bindModel = function(UsedModel: Model<any>) {
    if (!this.models) {
      this.models = {};
    }
    this.models[UsedModel.modelName] = UsedModel;
    return UsedModel;
  };

  schema.statics._checkModel = function(modelName: string) {
    if (!this.models || !this.models[modelName]) {
      throw new Error(`Should bind model [${modelName}] to Transaction.models first.`);
    }
    return this.models[modelName];
  };

  schema.statics.initialize = async function(mark: string, memo: any) {
    const t = await this.create({ mark, memo, initializedAt: new Date() });
    await didTransactionInitialized(t, mark, memo);
    return t._id;
  };

  schema.statics.pend = async function(id: IObjectId, modelName: string) {
    const t = await this.findOneAndUpdate({
      _id: id,
      state: {
        $in: [
          TRANSACTION_STATE.initialized,
          TRANSACTION_STATE.pending,
        ],
      },
    }, {
      $set: {
        state: TRANSACTION_STATE.pending,
      },
      $addToSet: {
        models: modelName,
      },
    }).setOptions({ read: 'primary' });
    if (!t) {
      throw new Error(`Transaction [${id}] is not valid.`);
    }
    await didTransactionPended(t, modelName);
  };

  schema.statics.commit = async function(id: IObjectId) {
    const t = await this.findOneAndUpdate({
      _id: id,
      state: {
        $in: [
          TRANSACTION_STATE.pending,
          TRANSACTION_STATE.initialized,
          TRANSACTION_STATE.committed,
        ],
      },
    }, {
      $set: {
        state: TRANSACTION_STATE.committed,
      },
    }, { new: true }).setOptions({ read: 'primary' });
    if (!t) {
      throw new Error(`Transaction [${id}] cannot commit.`);
    }
    for (const modelName of t.models) {
      const UsedModel = this._checkModel(modelName) as Model<any>;
      // remove backup and unlock.
      await UsedModel.update({ __t: id }, {
        $unset: {
          __b: 1,
          __t: 1,
        },
      }, { multi: true });
    }
    t.state = TRANSACTION_STATE.finished;
    t.cost = Date.now() - t.initializedAt.getTime();
    await t.save();
    await didTransactionCommitted(t, t.cost);
  };

  schema.statics.cancel = async function(id: IObjectId, error: IError) {
    const t = await this.findOneAndUpdate({
      _id: id,
      state: {
        $in: [
          TRANSACTION_STATE.initialized,
          TRANSACTION_STATE.pending,
          TRANSACTION_STATE.rollback,
        ],
      },
    }, {
      $set: {
        state: TRANSACTION_STATE.rollback,
      },
    }, { new: true }).setOptions({ read: 'primary' });
    if (!t) {
      throw new Error(`Transaction [${id}] cannot cancel. Cancel reason: ${error.message}`);
    }
    // recover recycle.
    const trashes = await Recycle.find({ tid: id }).setOptions({ read: 'primary' });
    for (const trash of trashes) {
      const UsedModel = this._checkModel(trash.srcModel) as Model<any>;
      if (!(await UsedModel.findById(trash.srcId).setOptions({ read: 'primary' }))) {
        const doc = Object.assign({
          __t: id,
        }, trash.data);
        await UsedModel.insertMany(doc);
      }
      await trash.remove();
    }
    for (const modelName of t.models) {
      const UsedModel = this._checkModel(modelName) as Model<any>;
      // recover backup and unlock.
      const docs = await UsedModel.find({ __t: id }).setOptions({ read: 'primary' });
      for (const doc of docs) {
        if (doc.__b) {
          // doc has updated
          // use backup to rewrite doc.
          await UsedModel.replaceOne({ _id: doc._id, __t: id }, doc.__b);
        } else if (typeof doc.__b === 'undefined') {
          // doc has lock with no backup.
          // only unlock.
          await UsedModel.update({ _id: doc._id, __t: id }, {
            $unset: {
              __t: 1,
              __b: 1,
            },
          });
        } else {
          // doc is created
          // remove the doc
          await UsedModel.remove({ _id: doc._id, __t: id });
        }
      }
    }
    if (!t.error || !t.error.name) {
      t.error = {
        name: error.name,
        type: error.type,
        message: error.message,
        stack: error.stack,
      };
    }
    t.state = TRANSACTION_STATE.cancelled;
    t.cost = Date.now() - t.initializedAt.getTime();
    await t.save();
    await didTransactionCancelled(t, t.cost, error);
  };

  schema.statics.try = async function(fn: (tid: IObjectId) => {}, mark: string, memo: any) {
    const t = await this.initialize(mark, memo);
    try {
      const result = await fn.bind(fn)(t);
      await this.commit(t);
      return result;
    } catch (error) {
      await this.cancel(t, error);
      throw error;
    }
  };

  schema.statics.cure = async function(timeout = 6e4) {
    const transactions = await this.find({
      initializedAt: { $lte: Date.now() - timeout },
      state: {
        $nin: [
          TRANSACTION_STATE.finished,
          TRANSACTION_STATE.cancelled,
        ],
      },
    }).setOptions({ read: 'primary' });
    for (const t of transactions) {
      if (t.state === TRANSACTION_STATE.committed) {
        await this.commit(t);
      } else {
        await this.cancel(t, new Error('Cancel unprocessed.'));
      }
    }
    await didTransactionCured(transactions);
  };

  return connection.model<ITransactionDocument, ITransactionModel>('transaction', schema);
};
