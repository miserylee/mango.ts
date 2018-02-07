declare module 'mongoose-timestamp' {
  import { Schema } from 'mongoose';

  function mongooseTimestamp(schema: Schema): void;

  namespace mongooseTimestamp {
  }
  export = mongooseTimestamp;
}
