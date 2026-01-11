interface EmbedConfig {
    model?: string;
    strategy?: string;
    dimensions?: number;
}
declare abstract class VType<Output> {
    protected readonly _phantom: Output;
}
declare abstract class VOptionalableType<Output> extends VType<Output> {
    abstract optional(): VType<Output | undefined>;
}
declare class VString extends VOptionalableType<string> {
    optional(): VStringOptional;
}
declare class VStringOptional extends VType<string | undefined> {
}
declare class VNumber extends VOptionalableType<number> {
    optional(): VNumberOptional;
}
declare class VNumberOptional extends VType<number | undefined> {
}
declare class VBoolean extends VOptionalableType<boolean> {
    optional(): VBooleanOptional;
}
declare class VBooleanOptional extends VType<boolean | undefined> {
}
declare class VText extends VOptionalableType<string> {
    embed(config?: EmbedConfig): VEmbeddedText;
    optional(): VOptionalText;
}
declare class VOptionalText extends VType<string | undefined> {
    embed(config?: EmbedConfig): VOptionalEmbeddedText;
}
declare class VEmbeddedText extends VType<string> {
    constructor(config: EmbedConfig);
}
declare class VOptionalEmbeddedText extends VType<string | undefined> {
    constructor(config: EmbedConfig);
}
declare const v: {
    readonly string: () => VString;
    readonly boolean: () => VBoolean;
    readonly number: () => VNumber;
    readonly text: () => VText;
};
declare function getEmbedConfig(type: VType<any>): EmbedConfig | undefined;

type TableShape = Record<string, VType<any>>;
declare class VTable<Shape extends TableShape> {
    readonly shape: Shape;
    constructor(shape: Shape);
}
declare class VSchema<Tables extends Record<string, VTable<any>>> {
    readonly tables: Tables;
    constructor(tables: Tables);
}
declare function defineTable<const Shape extends TableShape>(shape: Shape): VTable<Shape>;
declare function defineSchema<const Tables extends Record<string, VTable<any>>>(tables: Tables): VSchema<Tables>;
type ExtractOutput<T> = T extends VType<infer O> ? O : never;
type InferDoc<T extends VTable<any>> = {
    [K in keyof T["shape"] as undefined extends ExtractOutput<T["shape"][K]> ? never : K]: ExtractOutput<T["shape"][K]>;
} & {
    [K in keyof T["shape"] as undefined extends ExtractOutput<T["shape"][K]> ? K : never]?: Exclude<ExtractOutput<T["shape"][K]>, undefined>;
};
type InferSchema<S extends VSchema<any>> = {
    [K in keyof S["tables"]]: InferDoc<S["tables"][K]>;
};

interface InsertResult {
    id: string;
    status: "queued" | (string & {});
}
type SearchResult<T extends VTable<any>> = InferDoc<T>;
interface SearchOptions {
    limit?: number;
}
interface InsertOptions {
}
interface ClientConfig<S extends VSchema<any>> {
    schema: S;
    apiKey?: string;
    apiUrl?: string;
    fetch?: typeof globalThis.fetch;
    headers?: Record<string, string>;
}
type VexiClient<S extends VSchema<any>> = {
    [K in keyof S["tables"]]: {
        insert(data: InferDoc<S["tables"][K]>, options?: InsertOptions): Promise<InsertResult>;
        search(query: string, options?: SearchOptions): Promise<Array<SearchResult<S["tables"][K]>>>;
    };
};
declare function createClient<S extends VSchema<any>>(config: ClientConfig<S>): VexiClient<S>;

export { type ClientConfig, type EmbedConfig, type InferDoc, type InferSchema, type InsertOptions, type InsertResult, type SearchOptions, type SearchResult, type TableShape, VBoolean, VBooleanOptional, VEmbeddedText, VNumber, VNumberOptional, VOptionalEmbeddedText, VOptionalText, VOptionalableType, VSchema, VString, VStringOptional, VTable, VText, VType, type VexiClient, createClient, defineSchema, defineTable, getEmbedConfig, v };
