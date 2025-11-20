# Bundling

## Single File Output

The build process uses **esbuild** to bundle all TypeScript files into a single ES module file for Lambda deployment.

### Why ES Modules?

The output uses ESM (ES modules) instead of CommonJS:
- **Modern syntax** - Uses `import`/`export` instead of `require`/`module.exports`
- **Better tree-shaking** - Dead code elimination
- **Native Node.js support** - Node.js 20 has full ESM support
- **Smaller output** - 6.6KB vs 7.7KB (CommonJS)
- **Future-proof** - ESM is the JavaScript standard

### Build Command

```bash
yarn build
```

### Output

```
dist/index.mjs  (~6.6KB, 206 lines)
```

All your TypeScript source files are bundled into this single ES module file:
- `src/index.ts` (Lambda handler)
- `src/merger.ts` (Merging logic)
- `src/types.ts` (Type definitions)

### Why Bundling?

**Benefits:**
1. **Smaller package** - Single file instead of many modules
2. **Faster cold starts** - Less files for Lambda to load
3. **No node_modules** - Everything bundled, no dependencies to install
4. **Tree-shaking** - Only includes code that's actually used

### Configuration

The bundling is configured in `package.json`:

```json
{
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/index.mjs --external:@aws-sdk/*"
  }
}
```

**Flags explained:**
- `--bundle` - Bundle all imports into one file
- `--platform=node` - Target Node.js (not browser)
- `--target=node20` - Use Node.js 20 features
- `--format=esm` - Output ES module format
- `--outfile=dist/index.mjs` - Output location (.mjs extension for ESM)
- `--external:@aws-sdk/*` - Don't bundle AWS SDK (Lambda provides it)

### Deployment Size

Before bundling (with tsc):
```
dist/
├── index.js       3.7KB
├── merger.js      5.5KB
├── merger.test.js 13.3KB
└── types.js       0.1KB
Total: 22.6KB
```

After bundling (with esbuild ESM):
```
dist/
└── index.mjs      6.6KB
Total: 6.6KB
```

**71% smaller!**

### What Gets Excluded

The bundler excludes:
- Test files (`.test.ts`)
- Type definitions (types are stripped)
- AWS SDK (Lambda runtime provides it)
- Unused code (tree-shaking)

### Verifying the Bundle

Check the bundle worked:

```bash
# Should show single file
ls -lh dist/

# Should show ~6.6KB
du -h dist/index.mjs

# Should show ESM exports
grep "export" dist/index.mjs
```

### Custom Bundling

If you need to customize the bundling:

1. **Exclude additional packages:**
   ```json
   "build": "esbuild ... --external:some-package"
   ```

2. **Minify the output:**
   ```json
   "build": "esbuild ... --minify"
   ```
   (Output will be ~5KB)

3. **Source maps for debugging:**
   ```json
   "build": "esbuild ... --sourcemap"
   ```

4. **Multiple entry points:**
   ```json
   "build": "esbuild src/*.ts --bundle --outdir=dist"
   ```

### Troubleshooting

**Build fails:**
```bash
# Clean and rebuild
rm -rf dist node_modules
yarn install
yarn build
```

**Bundle too large:**
```bash
# Analyze what's included
esbuild src/index.ts --bundle --metafile=meta.json --analyze
```

**Missing runtime dependencies:**
```bash
# Add them as external
esbuild ... --external:package-name
```

## Alternative: TypeScript Only (No Bundling)

If you prefer separate files, change `package.json`:

```json
{
  "scripts": {
    "build": "tsc"
  }
}
```

Remove esbuild from devDependencies:
```bash
yarn remove esbuild
```

**Trade-offs:**
- ✅ Easier to debug (separate files)
- ✅ Faster builds (no bundling)
- ❌ Larger deployment package
- ❌ Slower Lambda cold starts
- ❌ Need to include node_modules

For Lambda, bundling is recommended.
