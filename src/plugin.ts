import {
  Document, DocumentQuery,
  Model, ModelFindByIdAndUpdateOptions,
  ModelFindOneAndUpdateOptions, ModelUpdateOptions, Query, Schema,
} from 'mongoose';
import { IRecycleModel } from './recycle';
import { ITransactionModel } from './transaction';
import { IObjectId } from './types';

export interface IPluggedDocument extends Document {
  __t: IObjectId;
  __b: any;

  constructor: IPluggedModel<this>;

  lock(tid: IObjectId): void;
}

export interface IModelFindOneAndUpdateOptions extends ModelFindOneAndUpdateOptions {
  __t: IObjectId;
}

export interface IModelFindByIdAndUpdateOptions extends ModelFindByIdAndUpdateOptions {
  __t: IObjectId;
}

export interface IModelUpdateOptions extends ModelUpdateOptions {
  __t: IObjectId;
}

export interface IModelFindOneAndRemoveOptions {
  /**
   * if multiple docs are found by the conditions, sets the sort order to choose
   * which doc to update
   */
  sort?: any;
  /** puts a time limit on the query - requires mongodb >= 2.6.0 */
  maxTimeMS?: number;
  /** sets the document fields to return */
  select?: any;
  __t: IObjectId;
}

export interface IModelFindByIdAndRemoveOptions {
  /** if multiple docs are found by the conditions, sets the sort order to choose which doc to update */
  sort?: any;
  /** sets the document fields to return */
  select?: any;
  __t: IObjectId;
}

export interface IPluggedModel<T extends IPluggedDocument> extends Model<T> {
  __lock(tid: IObjectId, conditions?: any): Promise<T>;

  findByIdAndUpdate(): DocumentQuery<T | null, T>;

  findByIdAndUpdate(id: any | number | string, update: any,
    callback?: (err: any, res: T | null) => void): DocumentQuery<T | null, T>;

  findByIdAndUpdate(id: any | number | string, update: any,
    options: IModelFindByIdAndUpdateOptions,
    callback?: (err: any, res: T | null) => void): DocumentQuery<T | null, T>;

  findOneAndUpdate(): DocumentQuery<T | null, T>;

  findOneAndUpdate(conditions: any, update: any,
    callback?: (err: any, doc: T | null, res: any) => void): DocumentQuery<T | null, T>;

  findOneAndUpdate(conditions: any, update: any,
    options: IModelFindOneAndUpdateOptions,
    callback?: (err: any, doc: T | null, res: any) => void): DocumentQuery<T | null, T>;

  update(conditions: any, doc: any,
    callback?: (err: any, raw: any) => void): Query<any>;

  update(conditions: any, doc: any, options: IModelUpdateOptions,
    callback?: (err: any, raw: any) => void): Query<any>;

  updateOne(conditions: any, doc: any,
    callback?: (err: any, raw: any) => void): Query<any>;

  updateOne(conditions: any, doc: any, options: IModelUpdateOptions,
    callback?: (err: any, raw: any) => void): Query<any>;

  updateMany(conditions: any, doc: any,
    callback?: (err: any, raw: any) => void): Query<any>;

  updateMany(conditions: any, doc: any, options: IModelUpdateOptions,
    callback?: (err: any, raw: any) => void): Query<any>;

  findOneAndRemove(conditions?: any,
    callback?: (err: any, res: T | null) => void): DocumentQuery<T | null, T>;

  findOneAndRemove(conditions: any,
    options: IModelFindOneAndRemoveOptions,
    callback?: (err: any, res: T | null) => void): DocumentQuery<T | null, T>;

  findByIdAndRemove(id?: any | number | string,
    callback?: (err: any, res: T | null) => void): DocumentQuery<T | null, T>;

  findByIdAndRemove(id: any | number | string,
    options: IModelFindByIdAndRemoveOptions,
    callback?: (err: any, res: T | null) => void): DocumentQuery<T | null, T>;

}

export interface IQuery<T extends IPluggedDocument> extends Query<IPluggedDocument> {
  options: any;
  model: IPluggedModel<T>;
  _conditions: any;
}

export default (Transaction: ITransactionModel, Recycle: IRecycleModel, {
  didDocumentLocked = () => null,
}: {
  didDocumentLocked?: <T extends IPluggedDocument>(tid: IObjectId, model: IPluggedModel<T>, doc: T) => void;
} = {}) => {
  return (schema: Schema) => {
    schema.add({
      __t: { type: Schema.Types.ObjectId, index: true },
      __b: {},
    });

    schema.statics.__lock = async function <T extends IPluggedDocument>(this: IPluggedModel<T>,
      tid: IObjectId, conditions: any): Promise<T | null> {
      // set transaction pending.
      // record used models.
      await Transaction.pend(tid, this.modelName);
      // lock data.
      if (!conditions) {
        return null;
      }
      const doc = await this.findOneAndUpdate({
        $and: [conditions, {
          $or: [{
            __t: tid,
          }, {
            __t: { $exists: false },
          }],
        }],
      }, {
        $set: {
          __t: tid,
        },
      });
      if (!doc) {
        throw new Error('Resource is busy or not exists.');
      } else {
        didDocumentLocked(tid, this, doc);
      }
      // save backup
      if (typeof doc.__b === 'undefined') {
        const b = doc.toJSON();
        Reflect.deleteProperty(b, '__t');
        Reflect.deleteProperty(b, '__v');
        await this.findByIdAndUpdate(doc._id, {
          $set: {
            __b: b,
          },
        });
      }
      doc.set('__t', undefined);
      doc.set('__b', undefined);
      return doc;
    };

    schema.methods.lock = async function <T extends IPluggedDocument>(this: T, tid: IObjectId): Promise<T | null> {
      return await this.constructor.__lock(tid, { _id: this._id });
    };

    schema.pre('save', function(this: IPluggedDocument, next) {
      const tid = this.__t;
      if (!tid) {
        return next();
      }
      (async _ => {
        if (this.isNew) {
          await this.constructor.__lock(this.__t);
          this.__b = null;
          next();
        } else {
          await this.constructor.__lock(this.__t, { _id: this._id });
          next();
        }
      })().catch(next);
    });

    schema.pre('findOneAndUpdate', function(this: IQuery<IPluggedDocument>, next) {
      const tid = this.options.__t;
      if (!tid) {
        return next();
      }
      (async _ => {
        const doc = await this.model.__lock(tid, this._conditions);
        // rewrite condition.
        this._conditions = { _id: doc._id };
        next();
      })().catch(next);
    });

    schema.pre('update', function(this: IQuery<IPluggedDocument>, next) {
      const tid = this.options.__t;
      if (!tid) {
        return next();
      }
      (async _ => {
        if (!this.options.multi) {
          const doc = await this.model.__lock(tid, this._conditions);
          this._conditions = { _id: doc._id };
        } else {
          const docs = await this.model.find(this._conditions);
          for (const doc of docs) {
            await this.model.__lock(tid, { _id: doc._id });
          }
          this._conditions = { $and: [this._conditions, { __t: tid }] };
        }
        next();
      })().catch(next);
    });

    schema.pre('findOneAndRemove', function(this: IQuery<IPluggedDocument>, next) {
      const tid = this.options.__t;
      if (!tid) {
        return next();
      }
      (async _ => {
        const doc = await this.model.__lock(tid, this._conditions);
        await Recycle.create({
          tid,
          model: this.model.modelName,
          id: doc._id,
          data: doc,
        });
        next();
      })().catch(next);
    });

    schema.pre('remove', function(this: IPluggedDocument, next) {
      const tid = this.__t;
      if (!tid) {
        return next();
      }
      (async _ => {
        const doc = await this.constructor.__lock(tid, { _id: this._id });
        await Recycle.create({
          tid,
          model: this.constructor.modelName,
          id: doc._id,
          data: doc,
        });
        next();
      })().catch(next);
    });

    schema.pre('find', () => {
      // console.log(this);
    });
    schema.pre('findOne', () => {
      // console.log(this);
    });
  };
};
