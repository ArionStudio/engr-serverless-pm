import type { z } from "zod";
import type {
  globalFolderDefinitionSchema,
  globalLibrarySchema,
  globalTagDefinitionSchema,
  organizationTemplateComplexitySchema,
  organizationTemplateSchema,
} from "./global-library.schema";

export type GlobalFolderDefinition = z.infer<
  typeof globalFolderDefinitionSchema
>;
export type GlobalTagDefinition = z.infer<typeof globalTagDefinitionSchema>;
export type OrganizationTemplateComplexity = z.infer<
  typeof organizationTemplateComplexitySchema
>;
export type OrganizationTemplate = z.infer<typeof organizationTemplateSchema>;
export type GlobalLibrary = z.infer<typeof globalLibrarySchema>;
