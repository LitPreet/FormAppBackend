import jwt, { JwtPayload } from "jsonwebtoken";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { Request, NextFunction } from 'express';
import { IUser, User } from "../models/user.model";


export interface DecodedToken extends JwtPayload {
    _id: string;
}
declare module 'express-serve-static-core' {
    interface Request {
      user?: IUser
    } 
  }


export const verifyJWT = asyncHandler(async (req: Request, _, next: NextFunction) => {
    try {
        const token = req.cookies?.accessToken || req.header('Authorization')?.replace("Bearer ", "");
        if (!token) {
            throw new ApiError(401, 'Unauthorized request')
        }
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as DecodedToken;
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
        if (!user) {
            throw new ApiError(401, "Inavalid Access Token")
        }
        req.user = user;
        next();
    } catch (err: any) {
        throw new ApiError(401, err?.message || "Inavlid access token");
    }
})