export { BTreeProxy as BTree } from "./workers/workerUtils"; // Public API is the Proxy
export type { BTreeConfig, BTreeStats, RangeOptions } from "./BTreeConfig";

export { type Serializer } from "./serializers/Serializer";
export { NumberSerializer } from "./serializers/NumberSerializer";
export { StringSerializer } from "./serializers/StringSerializer";
// Export other serializers
// export { Int32Serializer } from './serializers/Int32Serializer';
// export { BooleanSerializer } from './serializers/BooleanSerializer';
// export { BigIntSerializer } from './serializers/BigIntSerializer';
// export { JSONSerializer } from './serializers/JSONSerializer';
// export { CompositeSerializer } from './serializers/CompositeSerializer';

// Example custom serializer (can be defined by user)
// export { DateSerializer } from './path/to/DateSerializer'; // If you make one
