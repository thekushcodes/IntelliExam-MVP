#include <iostream>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>
#include <fstream>

using namespace std;

struct Question
{
    int id;
    string question;
    vector<string> options;
    int correctOption;
    int difficulty;
    string topic;
    string subtopic;
    vector<string> prerequisites;
    bool asked = false;
};

nlohmann::json loadJSON()
{
    ifstream file("questions.json"); // Opening json file
    // Check if file opened successfully
    if (!file)
    {
        cout << "Could not open questions file" << endl;
    }
    nlohmann::json data; // Created json variable
    file >> data;        // data variable contains json file content

    return data;
}

vector<Question> getQuestions(nlohmann::json data)
{
    vector<Question> questions;

    for (auto& item : data["questions"])
    {
        Question q;

        q.id = item["id"];
        q.question = item["question"];
        q.options = item["options"].get<vector<string>>();
        q.correctOption = item["correctOption"];
        q.difficulty = item["difficulty"];
        q.topic = item["topic"];
        q.subtopic = item["subtopic"];
        q.prerequisites = item["prerequisites"].get<vector<string>>();

        questions.push_back(q);
    }

    return questions;
}

Question* findStartingQuestion(vector<Question>& questions)
{
    for (auto& q : questions)
    {
        if (q.difficulty == 5 && !q.asked)
        {
            return &q;
        }
    }

    return nullptr;
}

int askQuestion(const Question& q)
{
    cout << "\n" << q.question << "\n\n";

    for (int i = 0; i < q.options.size(); i++)
    {
        cout << i + 1 << ". " << q.options[i] << endl;
    }

    int answer;

    cout << "\nEnter your answer (1-4): ";
    cin >> answer;

    return answer;
}

bool checkAnswer(const Question& q, int answer)
{
    return answer == q.correctOption;
}

void markQuestionAsked(Question& q)
{
    q.asked = true;
}

bool hasQuestionsRemaining(const vector<Question>& questions)
{
    for (const auto& q : questions)
    {
        if (!q.asked)
        {
            return true;
        }
    }

    return false;
}

Question* selectHigherDifficulty(
    vector<Question>& questions,
    int currentDifficulty)
{
    for (auto& q : questions)
    {
        if (q.difficulty > currentDifficulty && !q.asked)
        {
            return &q;
        }
    }

    return nullptr;
}

Question* selectPrerequisiteQuestion(
    vector<Question>& questions,
    const Question& currentQuestion)
{
    for (const string& prerequisite : currentQuestion.prerequisites)
    {
        for (auto& q : questions)
        {
            if (!q.asked &&
                (q.topic == prerequisite || q.subtopic == prerequisite))
            {
                return &q;
            }
        }
    }

    return nullptr;
}

Question* selectLowerDifficulty(
    vector<Question>& questions,
    int currentDifficulty)
{
    for (auto& q : questions)
    {
        if (q.difficulty < currentDifficulty && !q.asked)
        {
            return &q;
        }
    }

    return nullptr;
}

Question* selectNextQuestion(
    vector<Question>& questions,
    const Question& currentQuestion,
    bool wasCorrect)
{
    if (wasCorrect)
    {
        Question* nextQuestion =
            selectHigherDifficulty(questions, currentQuestion.difficulty);

        if (nextQuestion != nullptr)
        {
            return nextQuestion;
        }
    }
    else
    {
        Question* prerequisiteQuestion =
            selectPrerequisiteQuestion(questions, currentQuestion);

        if (prerequisiteQuestion != nullptr)
        {
            return prerequisiteQuestion;
        }

        Question* lowerQuestion =
            selectLowerDifficulty(questions, currentQuestion.difficulty);

        if (lowerQuestion != nullptr)
        {
            return lowerQuestion;
        }
    }

    return nullptr;
}

void runTest(vector<Question>& questions)
{
    Question* currentQuestion = findStartingQuestion(questions);

    while (currentQuestion != nullptr)
    {
        int answer = askQuestion(*currentQuestion);

        bool wasCorrect = checkAnswer(*currentQuestion, answer);

        if (wasCorrect)
        {
            cout << "\nCorrect!\n";
        }
        else
        {
            cout << "\nWrong!\n";
        }

        markQuestionAsked(*currentQuestion);

        if (!hasQuestionsRemaining(questions))
        {
            cout << "\nTest finished! All questions have been used.\n";
            break;
        }

        currentQuestion = selectNextQuestion(
            questions,
            *currentQuestion,
            wasCorrect
        );
    }
}

int main()
{
    nlohmann::json data = loadJSON();

    vector<Question> questions = getQuestions(data);

    runTest(questions);

    return 0;
}