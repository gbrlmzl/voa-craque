// O cliente do Prisma 7 em src/generated usa `import.meta.url`, que nao existe em
// CommonJS. Troca por um equivalente e entrega o resto ao SWC do next/jest.
const { createTransformer } = require("next/dist/build/swc/jest-transformer");

const transformer = createTransformer({});
const IMPORT_META_URL = 'require("node:url").pathToFileURL(__filename).href';

module.exports = {
  process(source, filename, options) {
    return transformer.process(source.replace(/import\.meta\.url/g, IMPORT_META_URL), filename, options);
  },
};
