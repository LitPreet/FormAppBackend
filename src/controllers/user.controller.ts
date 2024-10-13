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
import mongoose, { Types } from "mongoose";
import { FormResponse } from "../models/formResponses.model";


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

    const options: {
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
    const { formType } = req.body;

    // Step 1: Define default form and questions based on form type
    let defaultForm = {
        heading: "Untitled Form",
        description: "Add a description",
        questions: [] as Types.ObjectId[], // Start with an empty questions array
        userId,
    };

    let defaultQuestions = [];

    switch (formType) {
        case "party_invite":
            defaultForm.heading = "Party Invitation";
            defaultForm.description = "Join us for a fun party!";
            defaultQuestions = [
                {
                    questionText: "Your Name",
                    questionDescription: "Please enter your name.",
                    questionType: "paragraph",
                    options: [],
                    answerType: "single",
                    required: true,
                },
                {
                    questionText: "Will you attend?",
                    questionDescription: "Let us know if you can make it.",
                    questionType: "mcq",
                    options: ["Yes", "No", "Maybe"],
                    answerType: "single",
                    required: true,
                },
            ];
            break;

        case "contact_form":
            defaultForm.heading = "Contact Us";
            defaultForm.description = "We'd love to hear from you!";
            defaultQuestions = [
                {
                    questionText: "Your Name",
                    questionDescription: "Please enter your name.",
                    questionType: "paragraph",
                    options: [],
                    answerType: "single",
                    required: true,
                },
                {
                    questionText: "Your Email",
                    questionDescription: "Please enter your email address.",
                    questionType: "paragraph",
                    options: [],
                    answerType: "single",
                    required: true,
                },
                {
                    questionText: "Your Message",
                    questionDescription: "What would you like to say?",
                    questionType: "paragraph",
                    options: [],
                    answerType: "multiple",
                    required: true,
                },
            ];
            break;

        case "feedback_form": // Suggestion for the third form type
            defaultForm.heading = "Feedback Form";
            defaultForm.description = "We appreciate your feedback!";
            defaultQuestions = [
                {
                    questionText: "Rate your experience",
                    questionDescription: "How would you rate your experience?",
                    questionType: "mcq",
                    options: ["1", "2", "3", "4", "5"],
                    answerType: "single",
                    required: true,
                },
                {
                    questionText: "What did you like?",
                    questionDescription: "Please share what you liked.",
                    questionType: "paragraph",
                    options: [],
                    answerType: "single",
                    required: true,
                },
                {
                    questionText: "What can be improved?",
                    questionDescription: "Please share your suggestions.",
                    questionType: "paragraph",
                    options: [],
                    answerType: "single",
                    required: true,
                },
            ];
            break;

        case "blank_form":
            defaultForm.heading = "Untitled Form";
            defaultForm.description = "Add a description";
            defaultQuestions = [
                {
                    questionText: "",
                    questionDescription: "",
                    questionType: "paragraph",
                    options: [],
                    answerType: "single",
                    required: false
                },
                {
                    questionText: "",
                    questionDescription: "",
                    questionType: "mcq",
                    options: ["Option 1"],
                    answerType: "single",
                    required: false
                },
            ];
            break;

        default:
            return res.status(400).json(new ApiError(400, 'Invalid form type'));
    }

    try {
        // Step 2: Create and save the form
        const form = new Form(defaultForm);
        await form.save(); // Save the form to get the _id

        // Step 3: Create question documents with the saved form's ID
        const createdQuestions = await Question.insertMany(
            defaultQuestions.map((question) => ({
                ...question,
                form: form._id, // Assign the created form's ID to each question
            }))
        );


        form.questions = createdQuestions.map((question) => question._id as Types.ObjectId);
        await form.save();

        // Step 4: Return the form with the newly added questions
        const response = {
            formId: form._id,
            heading: form.heading,
            description: form.description,
            questions: createdQuestions, // Return full question details here
        };

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {
                        response,
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
    try {
        //step 1 to find the form
        const form = await Form.findById(formId).populate('questions')

        if (!form) {
            return res.status(404).json(new ApiError(404, 'Form not found'));
        }

        form.heading = heading;
        form.description = description;

        for (const updatedQuestion of questions) {
            if (updatedQuestion._id) {
                const updatedData = {
                    questionText: updatedQuestion.questionText,
                    questionDescription: updatedQuestion.questionDescription,
                    options: updatedQuestion.options,
                    answerType: updatedQuestion.answerType,
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
        return res.status(500).json(new ApiError(500, 'Error Updating form'));
    }
});


const addQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { formId, questionType,answerType } = req.body;

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
            answerType: answerType
        });

        await newQuestion.save();

        await Form.findByIdAndUpdate(formId, { $push: { questions: newQuestion._id } });

        return res.status(201).json(new ApiResponse(201, newQuestion, "Question added successfully"));
    } catch (error) {
        return res.status(500).json({ message: "Error adding question", error });
    }
});


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
        const forms = await Form.find({ userId: userId })
            .select("heading description createdAt")  // Select only the fields needed
            .populate({
                path: "questions",
                select: "_id",  // Only populate question IDs to enable count
            })
            .lean();  // Convert to plain JavaScript objects

            const formsWithSubmissionCount = await Promise.all(forms.map(async (form) => {
                // Count submissions for each form
                const submissionCount = await FormResponse.countDocuments({ formID: form._id });
    
                return {
                    ...form,
                    questionsCount: form.questions.length,
                    submissionCount,  // Add submission count
                };
            }));

        return res.status(200).json(new ApiResponse(200, formsWithSubmissionCount, "Forms fetched successfully"));
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

const getQuestionByID = async (req: Request, res: Response) => {
    const questionId = req.params;
    try {
        const question = await Question.findById(questionId)
        if (!question) {
            return res.status(404).json(new ApiError(404, "Question not found"));
        }

        return res.status(200).json(new ApiResponse(200, question, "Question fetched successfully"));
    } catch (error) {

        return res.status(500).json(new ApiError(500, "Error fetching Question"));
    }
};

// Route to handle form submission
const submitFormResponse = async (req: Request, res: Response) => {
    const { formId } = req.params;
    const { answers } = req.body;
    if (!formId) {
        throw new ApiError(404, 'form ID not found')
    }
    if (!answers || answers.length === 0) {
        return res.status(400).json(new ApiError(400, "Answers are required")); // Bad Request
    }
    try {
        const form = await Form.findById(formId);

        if (!form) {
            return res.status(404).json(new ApiError(404, "Form not found"));
        }
        // Create a new response document
        const response = new FormResponse({
            formID: formId,
            answers: answers
        });

        await response.save();  // Save the response
        return res.status(200).json(new ApiResponse(200, {}, "Form response submitted successfully"));
    } catch (error) {
        return res.status(500).json({ error: "Error submitting form response" });
    }
};

const getFormResponseById = async (req: Request, res: Response) => {
    const { formId } = req.params;
    if (!formId) {
        throw new ApiError(404, 'form ID not found')
    }

    try {
        const form = await Form.findById(formId);
        if (!form) {
            return res.status(404).json(new ApiError(404, "Form not found"));
        }

        // Step 2: Fetch the form response by formId, not _id
        const response = await FormResponse.find({ formID: formId });
        if (!response) {
            return res.status(404).json(new ApiError(404, "Form response not found"));
        }
        return res.status(200).json(new ApiResponse(200, response, "Form response fethced successfully"));
    } catch (error) {
        return res.status(500).json({ error: "Error fetching form response" });
    }
};

const deleteFormResponseById = async (req: Request, res: Response) => {
    const { formId } = req.params;
    if (!formId) {
        throw new ApiError(404, 'Form ID not found');
    }
    try {
        const form = await Form.findById(formId);
        if (!form) {
            return res.status(404).json(new ApiError(404, "Form not found"));
        }

        // Delete the form response by formId
        const response = await FormResponse.findOneAndDelete({ formID: formId });

        if (!response) {
            return res.status(404).json(new ApiError(404, "Form response not found"));
        }

        return res.status(200).json(new ApiResponse(200, {}, "Form response deleted successfully"));
    } catch (error) {
        return res.status(500).json({ error: "Error deleting form response" });
    }
};

const deleteForm = asyncHandler(async (req: Request, res: Response) => {
    const { formId } = req.params;
    const userId = req.user?.id; 

    try {
        // Find the form by ID
        const form = await Form.findById(formId);
        if (!form) {
            throw new ApiError(404, "Form not found");
        }

        // Check if the user is the creator of the form
        const isFormCreator = form.userId.equals(userId); 
        if (isFormCreator) {
            await Form.findByIdAndDelete(formId);
            return res.status(200).json(new ApiResponse(200, {}, 'Form deleted successfully'));
        } else {
            return res.status(403).json(new ApiError(403, "You are not authorized to delete this form"));
        }
    } catch (error: any) {
        // Catch any errors and return a 500 Internal Server Error response
        return res.status(500).json(new ApiError(500, "Error deleting form"));
    }
});


const sendFormUrlMail = asyncHandler(async (req: Request, res: Response) => {
    const {url, recipientEmail } = req.body; 

    if (!recipientEmail || !url) {
        return res.status(400).json(new ApiError(400, "Recipient email and form URL are required."));
    }

    try {
        await sendMail({
            email: recipientEmail,
            subject: "You've been invited to fill out a form!",
            text: `Hello,\n\nYou have been invited to submit a form. You can access it using the following link:\n\n${url}\n\nBest regards,\nFormiverse`
        });

        return res.status(200).json({ message: "Email sent successfully!" }); // Successful response
    } catch (error: any) {
        // Catch any errors and return a 500 Internal Server Error response
        return res.status(500).json(new ApiError(500, "Error sending email: " + error.message));
    }
});


export { verifyOTP,sendFormUrlMail, getQuestionByID, deleteFormResponseById, submitFormResponse, getFormResponseById, registerUser, refreshAccessToken, loginUser, getCurrentUser, sendEmail, createNewForm, addQuestion, getAllForms, getFormByID, updateForm, deleteForm, deleteFormQuestion }