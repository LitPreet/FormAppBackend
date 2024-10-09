import mongoose, { Document, Model, Schema, Types } from "mongoose";

interface IForm extends Document {
    heading: string;
    description: string;
    questions: Types.ObjectId[];
    userId: Types.ObjectId; 
}


const formSchema = new Schema<IForm>({
    heading: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    questions: [{
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Question"
    }],
    userId: { 
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true })

const Form: Model<IForm> = mongoose.model<IForm>("Form", formSchema);
export { Form }

