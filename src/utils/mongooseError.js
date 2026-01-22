import ApiResponse from "./ApiResponse.js";

function handleMongoErrors(error, res) {
  if (error.name === "ValidationError") {
    // Mongoose validation error
    const messages = Object.values(error.errors).map((err) => err.message);
    return res
      .status(400)
      .json(new ApiResponse(400, null, messages.join(", ")));
  } else if (error.code === 11000) {
    // Duplicate key error (e.g. unique index violated)
    const field = Object.keys(error.keyPattern)[0];
    return res
      .status(409)
      .json(new ApiResponse(409, null, `Duplicate value for field: ${field}`));
  } else if (error.name === "CastError") {
    // Invalid ObjectId format
    return res
      .status(400)
      .json(new ApiResponse(400, null, `Invalid ID format for ${error.path}`));
  } else {
    // Generic server error
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Internal server error"));
  }
}


export default handleMongoErrors;