import { Connection, Document, Model, Schema, SchemaDefinition } from 'mongoose';
import * as mongooseTimestamp from 'mongoose-timestamp';
import { IObjectId } from './types';

export interface IRecycleDocument extends Document {
  tid: IObjectId;
  srcModel: string;
  srcId: string;
  data: any;
}

const definition: SchemaDefinition = {
  tid: { type: Schema.Types.ObjectId, required: true },
  srcModel: { type: String, required: true },
  srcId: { type: String, required: true },
  data: {},
};

export interface IRecycleModel extends Model<IRecycleDocument> {
}

export default (connection: Connection): IRecycleModel => {
  const schema = new Schema(definition);

  schema.index({ tid: 1, srcModel: 1, srcId: 1 }, { unique: true });
  schema.index({ createdAt: 1 }, { expires: 2592000000 as any });

  schema.plugin(mongooseTimestamp);

  return connection.model<IRecycleDocument, IRecycleModel>('recycle', schema);
};
