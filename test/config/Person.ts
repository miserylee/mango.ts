import { Schema } from 'mongoose';
import * as mongooseTimestamp from 'mongoose-timestamp';
import { IPluggedDocument, IPluggedModel } from '../../src';

import { connection, plugin, Transaction } from './mangoInstance';

const schema = new Schema({
  name: String,
  gender: String,
  profile: {
    nickname: String,
  },
});

export interface IPersonDocument extends IPluggedDocument {
  name: string;
  gender: string;
  profile: {
    nickname: string;
  };
}

export interface IPersonModel extends IPluggedModel<IPersonDocument> {
}

schema.plugin(mongooseTimestamp);
schema.plugin(plugin);

export default Transaction.bindModel<IPersonModel>(connection.model<IPersonDocument, IPersonModel>('person', schema));
