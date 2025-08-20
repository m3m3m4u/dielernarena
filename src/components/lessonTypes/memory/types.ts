export interface MemoryPair { a:{kind:string; value:string}; b:{kind:string; value:string} }
export interface MemoryCard { id:string; pair:number; side:'a'|'b'; kind:string; value:string; flipped:boolean; matched:boolean }
