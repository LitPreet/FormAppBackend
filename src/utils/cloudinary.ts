import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

  // Configuration
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });


export const uploadOnCloudinary = async (localFilePath:string):Promise<any | null> => {
  try {
    if (!localFilePath) return null;
    //upload an image
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    //file has been successfully uploaded
    // console.log(response.url, "successfully uploaded");
    fs.unlinkSync(localFilePath)
    return response;
  } catch (err) {
    fs.unlinkSync(localFilePath); //remove the locally saved temporary file as the upload operation got failed
    return null;
  }
};
