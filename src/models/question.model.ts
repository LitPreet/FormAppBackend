import mongoose, { Document, Schema, Model, Types } from "mongoose";

interface IQuestion extends Document {
    form: Types.ObjectId;  // Reference to the form this question belongs to
    questionText: string;  // The text for the question
    questionType: 'email' | 'paragraph' | 'mcq' | 'checkbox' | 'dropdown' | 'date' | 'time';  // Type of question
    options?: string[];    // For MCQ, checkbox, and dropdown (optional, required only for these types)
    required: boolean;     // Whether the question is mandatory
    questionDescription?:string; // The description for the question
    answerType: 'single' | 'multiple';
}

const questionSchema = new Schema<IQuestion>({
    form: {
        type: Schema.Types.ObjectId,
        ref: "Form",   // Reference to the Form schema
        required: true
    },
    questionText: {
        type: String,
        required: false
    },
    questionDescription: {
        type: String,
        required: false
    },
    questionType: {
        type: String,
        enum: ['email', 'paragraph', 'mcq', 'checkbox', 'dropdown', 'date', 'time','url'],  // Allowed types
        required: true
    },
    options: [{
        type: String
    }],  // Options for MCQ, checkbox, and dropdown
    required: {
        type: Boolean,
        default: false  // Not mandatory by default
    },
    answerType: {
        type: String,
        enum: ['single', 'multiple'], // Allowed answer types
        required: true, // Specify if this is mandatory
    }
}, { timestamps: true });

const Question: Model<IQuestion> = mongoose.model<IQuestion>("Question", questionSchema);

export { Question };
