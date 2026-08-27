export const PROJECT_SETTINGS_PATH = "Metadata/project_settings.config";
export const MODEL_SETTINGS_PATH = "Metadata/model_settings.config";
export const TOP_MODEL_PATH = "3D/3dmodel.model";

/** Files pulled from the Bambu source .3mf and merged/adapted specially, rather than copied verbatim. */
export const SPECIAL_HANDLING = new Set<string>([PROJECT_SETTINGS_PATH, MODEL_SETTINGS_PATH, TOP_MODEL_PATH]);
