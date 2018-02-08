import * as mongoose from 'mongoose';

(mongoose as any).Promise = global.Promise;
const connection = mongoose.createConnection('mongodb://localhost/mangots');

connection.on('connected', () => {
  console.log('db connected.');
});
connection.on('close', () => {
  console.log('db closed.');
});
connection.on('error', err => {
  console.error(err);
});

export default connection;
