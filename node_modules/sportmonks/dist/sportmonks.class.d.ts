export declare class SportmonksApi {
    baseUrl: any;
    token: any;
    constructor(tokenId: string, sport?: string);
    get(endpoint: any, params: any): Promise<{}>;
    _composeUrl(endpoint: any, params: any): any;
}
