import mongoose, { Document, Model, Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";


export interface IUser extends Document {
    username: string;
    email: string;
    fullName: string;
    password: string;
    tokenVersion: number;
    refreshToken?: string;
    createdAt: Date;  // Timestamp for creation
    updatedAt: Date;  // Timestamp for updates

    isPasswordCorrect(password: string): Promise<boolean>;
    generateAccessToken(): string;
    generateRefreshToken(): string;
    hashRefreshToken(refreshToken: string): Promise<void>;
    isRefreshTokenCorrect(refreshToken: string): Promise<boolean>;
}


const userSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        password: {
            type: String,
            required: [true, "password is required"],
        },
        refreshToken: {
            type: String,
        },
        tokenVersion: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10)
    next();
})

// Compare input password with hashed password
userSchema.methods.isPasswordCorrect = async function (password: string): Promise<boolean> {
    return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function (): string {
    return jwt.sign({
        _id: this._id,
        email: this.email,
        username: this.username,
        fullName: this.fullName
    }, process.env.ACCESS_TOKEN_SECRET!, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    })
}

userSchema.methods.generateRefreshToken = function (): string {
    return jwt.sign(
        {
            _id: this._id,
            tokenVersion: this.tokenVersion,
        },
        process.env.REFRESH_TOKEN_SECRET!,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
        }
    );
};

userSchema.methods.hashRefreshToken = async function (refreshToken: string): Promise<void> {
    const salt = await bcrypt.genSalt(10);
    this.refreshToken = await bcrypt.hash(refreshToken, salt);
};

userSchema.methods.isRefreshTokenCorrect = async function (refreshToken: string): Promise<boolean> {
    return await bcrypt.compare(refreshToken, this.refreshToken);
};

const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
export { User }
