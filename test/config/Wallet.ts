import { Schema } from 'mongoose';
import * as mongooseTimestamp from 'mongoose-timestamp';
import { IPluggedDocument, IPluggedModel } from '../../src';
import { IObjectId } from '../../src';

import { connection, plugin, Transaction } from './mangoInstance';

const schema = new Schema({
  person: { type: Schema.Types.ObjectId, ref: 'person' },
  money: { type: Number, default: 0, min: 0 },
});

schema.plugin(mongooseTimestamp);
schema.plugin(plugin);

export interface IWalletDocument extends IPluggedDocument {
  person: IObjectId;
  money: number;
}

export interface IWalletModal extends IPluggedModel<IWalletDocument> {
}

export default Transaction.bindModel<IWalletModal>(connection.model<IWalletDocument, IWalletModal>('wallet', schema));
