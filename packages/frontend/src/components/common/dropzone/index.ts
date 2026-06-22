// Public dropzone API. Both components are composed from the same internal building
// blocks — `dropzone-surface.vue` (the drag/drop target + mechanics) and
// `dropzone-file-item.vue` (one selected-file row) — which are intentionally not
// exported: consumers pick a dropzone by selection shape, single vs. multiple.
export { default as FileDropzone } from './file-dropzone.vue';
export { default as MultiFileDropzone } from './multi-file-dropzone.vue';
