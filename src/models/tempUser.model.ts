import mongoose, { Document, Model, Schema } from "mongoose";


export interface ITempUser extends Document {
  username: string;
  email: string;
  fullName: string;
  password: string;
  otp: string;
  expiresAt: Date;
}

const temporaryUserSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
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
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "password is required"],
    },
    otp: { type: String, required: true }, // Store OTP for verification
    expiresAt: { type: Date, required: true }, // Add expiry for temporary data
  },
  { timestamps: true }
);

export const TemporaryUser: Model<ITempUser> = mongoose.model<ITempUser>(
  "TemporaryUser",
  temporaryUserSchema
);
