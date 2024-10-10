import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { Request, Response } from "express";
import { generateOTP } from "../utils/generateOtp";
import { TemporaryUser } from "../models/tempUser.model";
import { sendMail } from "../utils/sendMail";
import { ApiResponse } from "../utils/ApiResponse";
import { parseDuration } from "../utils/parseTokenExpiry";
import fs from 'fs';
import jwt from "jsonwebtoken";
import csv from 'csv-parser';
import { DecodedToken } from "../middlewares/auth.middleware";
import { Form } from "../models/form.model";
import { Question } from "../models/question.model";
import { Types } from "mongoose";


const generateAccessAndRefreshToken = async (userId: string) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, "User not found");
        }
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        await user.hashRefreshToken(refreshToken);
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (err) {
        throw new ApiError(
            500,
            "Something went wrong while generating access and refresh token"
        );
    }
}

const registerUser = asyncHandler(async (req: Request, res: Response) => {
    const { username, fullName, email, password } = req.body;
    console.log(req.body, 'hey')
    if ([username, fullName, email, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User with this email and username already exists");
    }

    const otp = generateOTP()
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const tempUser = await TemporaryUser.create({
        email,
        username,
        fullName,
        password,
        otp,
        expiresAt
    })
    await tempUser.save()
    await sendMail({
        email,
        subject: "Your OTP Code",
        text: `Your OTP Code is ${otp}`
    });
    res
        .status(200)
        .json(
            new ApiResponse(
                201,
                { email },
                "OTP sent to your email. Please verify to complete registration."
            )
        );
})


const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET!
        ) as DecodedToken;

        const user = await User.findById(decodedToken?._id);

        if (!user || !(await user.isRefreshTokenCorrect(incomingRefreshToken))) {
            throw new ApiError(401, "Invalid refresh token or user not found.");
        }

        const accessToken = user.generateAccessToken();
        const newRefreshToken = user.generateRefreshToken();
        await user.hashRefreshToken(newRefreshToken);
        await user.save({ validateBeforeSave: false });

        const accessTokenExpiry =
            parseDuration(process.env.ACCESS_TOKEN_EXPIRY!) || 15 * 60 * 1000; // Default to 15 minutes
        const refreshTokenExpiry =
            parseDuration(process.env.REFRESH_TOKEN_EXPIRY!) ||
            7 * 24 * 60 * 60 * 1000;

        const options = {
            httpOnly: true,
            secure: true,
            sameSite: true,
        };

        // const accessToken = await generateAccessAndRefreshToken(user._id);
        // const newrefreshToken = await generateAccessAndRefreshToken(user._id);
        return res
            .status(200)
            .cookie("accessToken", accessToken, {
                ...options,
                maxAge: accessTokenExpiry,
            })
            .cookie("refreshToken", newRefreshToken, {
                ...options,
                maxAge: refreshTokenExpiry,
            })
            .json(new ApiResponse(200, {}, "Access Token refreshed successfully"));
    } catch (error: any) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current User fethched successfully"));
});

const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
    const { email, otp } = req.body;
    if (!(email || otp)) {
        throw new ApiError(400, "email and otp required");
    }
    const tempUser = await TemporaryUser.findOne({ email: email });
    if (!tempUser || tempUser.expiresAt.getTime() < Date.now()) {
        throw new ApiError(400, "Invalid or expired otp");
    }
    const user = await User.create({
        fullName: tempUser.fullName,
        email: tempUser.email,
        username: tempUser.username,
        password: tempUser.password,
    });

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user?._id as string)

    if (!accessToken || !refreshToken) {
        throw new ApiError(500, "Failed to generate tokens");
    }
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    // Clean up the temporary user record and OTP
    await TemporaryUser.deleteOne({ email, otp });
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }
    const accessTokenExpiry =
        parseDuration(process.env.ACCESS_TOKEN_EXPIRY!) || 15 * 60 * 1000; // Default to 15 minutes
    const refreshTokenExpiry =
        parseDuration(process.env.REFRESH_TOKEN_EXPIRY!) || 7 * 24 * 60 * 60 * 1000; // Default to 7 days


    const options = {
        httpOnly: true,
        secure: true,
        sameSite: true,
    };
    return res
        .status(200)
        .cookie("accessToken", accessToken, {
            ...options,
            maxAge: accessTokenExpiry,
        })
        .cookie("refreshToken", refreshToken, {
            ...options,
            maxAge: refreshTokenExpiry,
        })
        .json(new ApiResponse(200, { user: createdUser, accessToken }, "User registered successfully"))

})

const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, username, password } = req.body;
    if ([email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }
    const user = await User.findOne({
        $or: [{ username }, { email }],
    });
    if (!user) {
        throw new ApiError(404, "User does not exist");
    }
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        user._id as string
    );
    const logedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    const accessTokenExpiry =
        parseDuration(process.env.ACCESS_TOKEN_EXPIRY!) || 2 * 60 * 60 * 1000; // Default to 15 minutes
    const refreshTokenExpiry =
        parseDuration(process.env.REFRESH_TOKEN_EXPIRY!) || 7 * 24 * 60 * 60 * 1000; // Default to 7 days

    const options:{
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'lax' | 'strict' | 'none'; // explicitly set one of the valid values
    } = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Secure cookies in production
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };
    return res
        .status(200)
        .cookie("accessToken", accessToken, {
            ...options,
            maxAge: accessTokenExpiry,
        })
        .cookie("refreshToken", refreshToken, {
            ...options,
            maxAge: refreshTokenExpiry,
        })
        .json(
            new ApiResponse(
                200,
                {
                    user: logedInUser,
                    accessToken,
                },
                "User logged in successfully"
            )
        );
})

const changePassword = asyncHandler(async (req: Request, res: Response) => {
    const { oldPassword, newPassword, email } = req.body;

    // const user = await User.findById(req.user?._id);
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if (!isPasswordCorrect) {
        throw new ApiError(400, `Invalid password`);
    }
    user.password = newPassword;
    await user.save({ validateBeforeSave: false });
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
})

const sendEmail = asyncHandler(async (req: Request, res: Response) => {
    const otp = generateOTP()
    await sendMail({
        email: 'preetkumar0234@gmail.com',
        subject: "Your OTP Code",
        text: `Your OTP Code is ${otp}`
    });
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    otp
                },
                "email sent in successfully"
            )
        );
})

const createNewForm = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    try {
        // Step 1: Create the form with empty questions array
        const defaultForm = {
            heading: "Untitled Form",
            description: "Add a description",
            questions: [] as Types.ObjectId[],  // Start with an empty questions array
            userId
        };
        const form = new Form(defaultForm);
        await form.save();

        // Step 2: Define default questions
        const defaultQuestions = [
            {
                form: form._id,
                questionText: "",
                questionDescription: "",
                questionType: "paragraph",
                options: [],
                required: false
            },
            {
                form: form._id,
                questionText: "",
                questionDescription: "",
                questionType: "mcq",
                options: ["Option 1"],
                required: false
            }
        ];

        // Step 3: Create question documents and add their IDs to the form
        const createdQuestions = await Question.insertMany(defaultQuestions);
        form.questions = createdQuestions.map((question) => question._id as Types.ObjectId);
        await form.save();

        // Step 4: Return the form with the newly added questions
        const response = {
            formId: form._id,
            heading: form.heading,
            description: form.description,
            questions: createdQuestions // Return full question details here
        };

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {
                        response
                    },
                    "Form created successfully"
                )
            );
    } catch (err) {
        return res.status(500).json(new ApiError(500, 'Error creating form'));
    }
});

const updateForm = asyncHandler(async (req: Request, res: Response) => {
    const { formId } = req.params;
    const { heading, description, questions } = req.body;
    if (!formId || !heading || !description || !Array.isArray(questions)) {
        throw new ApiError(400, "All fields are required, Some fields are missing.");
    }
    console.log({heading, description, questions, formId})
    console.log(questions.map(t => t.options))
    try {
        //step 1 to find the form
        const form = await Form.findById(formId).populate('questions')

        if (!form) {
            return res.status(404).json(new ApiError(404, 'Form not found'));
        }

        form.heading = heading;
        form.description = description;

        // Step 3: Update or add new questions
        // if (questions && questions.length > 0) {
        //     for (const updatedQuestion of questions) {
        //         if (updatedQuestion._id && updatedQuestion.form) {
        //             await Question.findByIdAndUpdate(updatedQuestion._id, {
        //                 questionText: updatedQuestion.questionText,
        //                 questionDescription: updatedQuestion.questionDescription,
        //                 questionType: updatedQuestion.questionType,
        //                 options: updatedQuestion.options,
        //                 required: updatedQuestion.required,
        //                 form: updatedQuestion.form
        //             })
        //             await form.save();
        //         }
        //         else {
        //             throw new ApiError(404, 'Question not found')
        //         }
        //     }
        // } if (questions && questions.length > 0) {
            for (const updatedQuestion of questions) {
                if (updatedQuestion._id) {
                    const updatedData = {
                        questionText: updatedQuestion.questionText,
                        questionDescription: updatedQuestion.questionDescription,
                        questionType: updatedQuestion.questionType,
                        options: updatedQuestion.options,
                        required: updatedQuestion.required,
                        form: formId // Ensure that the form ID is set correctly
                    };

                    // Update the question by ID
                    const questionUpdate = await Question.findByIdAndUpdate(updatedQuestion._id, updatedData, { new: true });
                    if (!questionUpdate) {
                        throw new ApiError(404, 'Question not found');
                    }
                } else {
                    throw new ApiError(400, 'Question ID is required');
                }
            }
            await form.save();
        const updatedForm = await Form.findById(formId).populate('questions');

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {
                        updatedForm
                    },
                    "Form Updated successfully"
                )
            );
    } catch (err) {
        console.error(err);
        return res.status(500).json(new ApiError(500, 'Error Updating form'));
    }
});


const addQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { formId, questionType } = req.body;

    // Set default question text if not provided
    const questionText = req.body.questionText?.trim() || " ";

    // Validate required fields
    if ([formId, questionType].some((value) => value === "")) {
        throw new ApiError(400, "Form ID and question type are required");
    }
    // Define default options
    const defaultOptions = questionType === 'mcq' || questionType === 'checkbox' ? [""] : [];


    try {
        const newQuestion = new Question({
            form: formId,
            questionText,
            questionDescription: '',
            questionType,
            options: defaultOptions,
        });

        await newQuestion.save();

        await Form.findByIdAndUpdate(formId, { $push: { questions: newQuestion._id } });

        return res.status(201).json(new ApiResponse(201, newQuestion, "Question added successfully"));
    } catch (error) {
        return res.status(500).json({ message: "Error adding question", error });
    }
});


const deleteForm = asyncHandler(async (req: Request, res: Response) => {
    const { formId } = req.params;
    try {
        const form = await Form.findById(formId);
        if (!form) {
            throw new ApiError(404, "Form not found")
        }
        await Form.findByIdAndDelete(formId)
        return res.status(200).json(new ApiResponse(200, {}, 'Successfully form deleted'))
    } catch (error: any) {
        return res.status(500).json(new ApiError(500, "Error deleting form"));
    }
})

const deleteFormQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { questionId } = req.params;
    try {
        const question = await Question.findById(questionId);
        if (!question) {
            throw new ApiError(404, "Question not found")
        }
        // Get the form ID associated with the question
        const formId = question.form;

 // Delete the question
        await Question.findByIdAndDelete(questionId);
        
        // Remove the question from the form's questions array
        await Form.findByIdAndUpdate(formId, { $pull: { questions: questionId } });

        // Fetch the updated form with the remaining questions
        const updatedForm = await Form.findById(formId).populate('questions');
        return res.status(200).json(new ApiResponse(200, updatedForm, 'Successfully Question deleted'))
    } catch (error: any) {
        return res.status(500).json(new ApiError(500, "Error deleting Question"));
    }
})

const getAllForms = async (req: Request, res: Response) => {
    const userId = req.user?._id;

    try {
        // const forms = await Form.find({ userId: userId }).populate("questions");
        const forms = await Form.find({ userId: userId })
            .select("heading description createdAt")  // Select only the fields needed
            .populate({
                path: "questions",
                select: "_id",  // Only populate question IDs to enable count
            })
            .lean();  // Convert to plain JavaScript objects

        // Add question count manually
        const formsWithQuestionCount = forms.map((form) => ({
            ...form,
            questionsCount: form.questions.length,
        }));
        return res.status(200).json(new ApiResponse(200, formsWithQuestionCount, "Forms fetched successfully"));
    } catch (error) {
        return res.status(500).json(new ApiError(500, "Error fetching forms"));
    }
};
const getFormByID = async (req: Request, res: Response) => {
    const formId = req.params;
    try {
        const form = await Form.findById(formId.formId).populate("questions");
        if (!form) {
            return res.status(404).json(new ApiError(404, "Form not found"));
        }

        return res.status(200).json(new ApiResponse(200, form, "Form fetched successfully"));
    } catch (error) {
        return res.status(500).json(new ApiError(500, "Error fetching forms"));
    }
};

export { verifyOTP, registerUser, refreshAccessToken, loginUser, getCurrentUser, sendEmail, createNewForm, addQuestion, getAllForms, getFormByID, updateForm, deleteForm, deleteFormQuestion }