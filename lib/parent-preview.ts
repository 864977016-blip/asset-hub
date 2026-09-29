import type {ParentProduct} from "./types";

export function parentPreviewImages(parent:Pick<ParentProduct,"cover"|"assets">){
 return [...new Set([parent.cover,...parent.assets.map(asset=>asset.image)].filter((image):image is string=>!!image))].slice(0,4);
}
