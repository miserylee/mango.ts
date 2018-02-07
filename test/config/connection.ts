import * as mongoose from 'mongoose';

(mongoose as any).Promise = global.Promise;
const connection = mongoose.createConnection('mongodb://localhost/mangots');

connection.on('connect', () => {
  console.log('db connected.');
});
connection.on('error', err => {
  console.error(err);
});

export default connection;
