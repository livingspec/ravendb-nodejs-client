
export class Dog {
    public Id: string;
    public name: string;
    public likes: string[];
    public dislikes: string[];
}

export class Entity {
    public Id: string;
    public name: string;
    public references: string;
}

export class Genre {
    public Id: string;
    public name: string;
}

export class Movie {
    public Id: string;
    public name: string;
    public genres: string[];
}

export class User {
    public Id: string;
    public name: string;
    public age: number;
    public hasRated: Rating[];
}

export class Rating {
    public movie: string;
    public score: number;
}